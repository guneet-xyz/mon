import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"

import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import { createTestDb, type TestDb } from "@mon/test-utils"

import { insertGithubCheckRun, insertGithubPing } from "./github"

// Exercises the real schema (FK from github_ping.check_run_id to
// github_check_run.id, unique ids) with the order the agent pushes in.

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))
}, 120_000)

afterAll(() => {
  testDb?.stop()
})

function poll(
  status: GithubCheckRunDTO["status"],
  conclusion: GithubCheckRunDTO["conclusion"],
  recordedAt: string,
) {
  const runs = [
    { id: 9001, name: "build" },
    { id: 9002, name: "test" },
  ]
  const checkRuns: GithubCheckRunDTO[] = runs.map((run) => ({
    kind: "github_check_run",
    ping_id: crypto.randomUUID(),
    agent_id: "agent-1",
    recorded_at: recordedAt,
    key: "repo",
    id: run.id,
    name: run.name,
    status,
    conclusion,
    details_url: `https://github.com/owner/repo/runs/${run.id}`,
    started_at: "2026-11-10T11:59:00.000Z",
    completed_at: status === "completed" ? recordedAt : null,
  }))
  const pings: GithubPingDTO[] = runs.map((run) => ({
    kind: "github_ping",
    ping_id: crypto.randomUUID(),
    agent_id: "agent-1",
    recorded_at: recordedAt,
    key: "repo",
    commit_hash: "abc123",
    check_run_id: run.id,
    error: null,
  }))
  return { checkRuns, pings }
}

async function ingest({ checkRuns, pings }: ReturnType<typeof poll>) {
  for (const run of checkRuns)
    await insertGithubCheckRun(run, { db: testDb.db })
  for (const ping of pings) await insertGithubPing(ping, { db: testDb.db })
}

describe("github ingest against Postgres", () => {
  it("stores every check run and a ping per run, across repeated polls", async () => {
    await ingest(poll("in_progress", null, "2026-11-10T12:00:00.000Z"))
    await ingest(poll("completed", "failure", "2026-11-10T12:01:00.000Z"))

    const { getLatestRuns } = await import("../actions/github/latest-runs")
    const runs = await getLatestRuns("repo")

    expect(runs.map((r) => r.name)).toEqual(["build", "test"])
    for (const run of runs) {
      expect(run.status).toBe("completed")
      expect(run.conclusion).toBe("failure")
    }

    const { getGithubStatus } = await import("../monitors/github")
    expect(typeof (await getGithubStatus("repo"))).toBe("string")
  }, 60_000)

  it("reports an already-stored check run as deduplicated", async () => {
    const { checkRuns } = poll(
      "completed",
      "success",
      "2026-11-10T12:02:00.000Z",
    )
    const result = await insertGithubCheckRun(checkRuns[0]!, {
      db: testDb.db,
    })
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
