import type { WebsitePingDTO } from "@mon/contracts"

import { describe, expect, it, mock } from "bun:test"

describe("insertWebsitePing", () => {
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

    const { insertWebsitePing: fn } = await import("./website")

    const dto: WebsitePingDTO = {
      kind: "website",
      ping_id: "test-id",
      agent_id: "agent-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "website-1",
      latency_ms: 150,
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

    const { insertWebsitePing: fn } = await import("./website")

    const dto: WebsitePingDTO = {
      kind: "website",
      ping_id: "test-id",
      agent_id: "agent-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "website-1",
      latency_ms: 150,
      error: null,
    }

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
