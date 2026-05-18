import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"

import { describe, expect, it, mock } from "bun:test"

describe("insertGithubCheckRun", () => {
  it("returns deduplicated: false on first insert", async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({
            returning: mock(async () => [{ pingId: "test-id" }]),
          })),
        })),
      })),
    }

    await mock.module("@mon/db", () => ({
      db: mockDb,
    }))

    const { insertGithubCheckRun: fn } = await import("./github")

    const dto: GithubCheckRunDTO = {
      kind: "github_check_run",
      ping_id: "test-id",
      daemon_id: "daemon-1",
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

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true on duplicate insert", async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({
            returning: mock(async () => []),
          })),
        })),
      })),
    }

    await mock.module("@mon/db", () => ({
      db: mockDb,
    }))

    const { insertGithubCheckRun: fn } = await import("./github")

    const dto: GithubCheckRunDTO = {
      kind: "github_check_run",
      ping_id: "test-id",
      daemon_id: "daemon-1",
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

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})

describe("insertGithubPing", () => {
  it("returns deduplicated: false on first insert", async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({
            returning: mock(async () => [{ pingId: "test-id" }]),
          })),
        })),
      })),
    }

    await mock.module("@mon/db", () => ({
      db: mockDb,
    }))

    const { insertGithubPing: fn } = await import("./github")

    const dto: GithubPingDTO = {
      kind: "github_ping",
      ping_id: "test-id",
      daemon_id: "daemon-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "github-1",
      commit_hash: "abc123",
      check_run_id: 123456,
      error: null,
    }

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true on duplicate insert", async () => {
    const mockDb = {
      insert: mock(() => ({
        values: mock(() => ({
          onConflictDoNothing: mock(() => ({
            returning: mock(async () => []),
          })),
        })),
      })),
    }

    await mock.module("@mon/db", () => ({
      db: mockDb,
    }))

    const { insertGithubPing: fn } = await import("./github")

    const dto: GithubPingDTO = {
      kind: "github_ping",
      ping_id: "test-id",
      daemon_id: "daemon-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "github-1",
      commit_hash: "abc123",
      check_run_id: 123456,
      error: null,
    }

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
