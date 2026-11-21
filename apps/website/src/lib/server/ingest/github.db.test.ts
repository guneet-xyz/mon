import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"

import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import { createTestDb, type TestDb } from "@mon/test-utils"

import { env } from "@/env"

import { insertGithubCheckRun, insertGithubPing } from "./github"

// Exercises the real schema (FK from github_ping.check_run_id to
// github_check_run.id, unique ids) with the order the agent pushes in.

let testDb: TestDb
let configDir: string
let originalConfigPath: string

beforeAll(async () => {
  testDb = await createTestDb()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))

  configDir = mkdtempSync(join(tmpdir(), "mon-github-db-test-"))
  const configPath = join(configDir, "config.toml")
  writeFileSync(
    configPath,
    [
      "[[tiles]]",
      'type = "github"',
      'key = "repo"',
      'repo = "owner/repo"',
      'github_token = "ghp_test"',
      "",
      "[[tiles]]",
      'type = "host"',
      'key = "host-only"',
      'address = "127.0.0.1"',
    ].join("\n"),
  )
  // With SKIP_ENV_VALIDATION (test-setup.ts) env is a plain object.
  originalConfigPath = env.CONFIG_PATH
  env.CONFIG_PATH = configPath
}, 120_000)

afterAll(() => {
  env.CONFIG_PATH = originalConfigPath
  if (configDir) rmSync(configDir, { recursive: true, force: true })
  testDb?.stop()
})

function poll(
  status: GithubCheckRunDTO["status"],
  conclusion: GithubCheckRunDTO["conclusion"],
  recordedAt: string,
  key = "repo",
  firstId = 9001,
) {
  const runs = [
    { id: firstId, name: "build" },
    { id: firstId + 1, name: "test" },
  ]
  const checkRuns: GithubCheckRunDTO[] = runs.map((run) => ({
    kind: "github_check_run",
    ping_id: crypto.randomUUID(),
    agent_id: "agent-1",
    recorded_at: recordedAt,
    key,
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
    key,
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

    expect(runs?.map((r) => r.name)).toEqual(["build", "test"])
    for (const run of runs ?? []) {
      expect(run.status).toBe("completed")
      expect(run.conclusion).toBe("failure")
    }

    const { getGithubStatus } = await import("../monitors/github")
    expect(typeof (await getGithubStatus("repo"))).toBe("string")
  }, 60_000)

  it("returns no runs for keys without a GitHub tile in the config", async () => {
    await ingest(
      poll(
        "completed",
        "success",
        "2026-11-10T12:03:00.000Z",
        "unlisted",
        9101,
      ),
    )
    await ingest(
      poll(
        "completed",
        "success",
        "2026-11-10T12:03:00.000Z",
        "host-only",
        9201,
      ),
    )

    const { getLatestRuns } = await import("../actions/github/latest-runs")
    expect(await getLatestRuns("unlisted")).toBeNull()
    expect(await getLatestRuns("host-only")).toBeNull()
    expect(await getLatestRuns("repo")).not.toBeNull()
  })

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
