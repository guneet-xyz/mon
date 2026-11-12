import { describe, expect, it, mock } from "bun:test"

import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"

import { insertGithubCheckRun, insertGithubPing } from "./github"

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

function makeUpsertDb(storedPingId: string): Db {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(() => ({
          returning: mock(async () => [{ pingId: storedPingId }]),
        })),
      })),
    })),
  } as unknown as Db
}

describe("insertGithubCheckRun", () => {
  it("returns deduplicated: false when the run is new", async () => {
    const db = makeUpsertDb(checkRunDto.ping_id)
    const result = await insertGithubCheckRun(checkRunDto, { db })
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true when the run was already stored", async () => {
    const db = makeUpsertDb("earlier-ping-id")
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
