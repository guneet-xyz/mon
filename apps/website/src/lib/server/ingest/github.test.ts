import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"

import { insertGithubCheckRun, insertGithubPing } from "./github"

import { describe, expect, it, mock } from "bun:test"

function makeMockDb(returning: () => Promise<{ pingId: string }[]>): Db {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoNothing: mock(() => ({
          returning: mock(returning),
        })),
      })),
    })),
  } as unknown as Db
}

const checkRunDto: GithubCheckRunDTO = {
  kind: "github_check_run",
  ping_id: "test-id",
  agent_id: "agent-1",
  recorded_at: "2026-05-18T12:00:00Z",
  key: "github-1",
  id: 123456,
  name: "test-check",
  status: "completed",
  conclusion: "success",
  details_url: "https://github.com/test",
  started_at: "2026-05-18T11:00:00Z",
  completed_at: "2026-05-18T12:00:00Z",
}

const pingDto: GithubPingDTO = {
  kind: "github_ping",
  ping_id: "test-id",
  agent_id: "agent-1",
  recorded_at: "2026-05-18T12:00:00Z",
  key: "github-1",
  commit_hash: "abc123",
  check_run_id: 123456,
  error: null,
}

describe("insertGithubCheckRun", () => {
  it("returns deduplicated: false on first insert", async () => {
    const db = makeMockDb(async () => [{ pingId: "test-id" }])
    const result = await insertGithubCheckRun(checkRunDto, { db })
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true on duplicate insert", async () => {
    const db = makeMockDb(async () => [])
    const result = await insertGithubCheckRun(checkRunDto, { db })
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})

describe("insertGithubPing", () => {
  it("returns deduplicated: false on first insert", async () => {
    const db = makeMockDb(async () => [{ pingId: "test-id" }])
    const result = await insertGithubPing(pingDto, { db })
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true on duplicate insert", async () => {
    const db = makeMockDb(async () => [])
    const result = await insertGithubPing(pingDto, { db })
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
