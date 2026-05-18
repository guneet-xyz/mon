import type { HostPingDTO } from "@mon/contracts"

import { describe, expect, it, mock } from "bun:test"

describe("insertHostPing", () => {
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

    const { insertHostPing: fn } = await import("./host")

    const dto: HostPingDTO = {
      kind: "host",
      ping_id: "test-id",
      agent_id: "agent-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "host-1",
      latency_ms: 42,
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

    const { insertHostPing: fn } = await import("./host")

    const dto: HostPingDTO = {
      kind: "host",
      ping_id: "test-id",
      agent_id: "agent-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "host-1",
      latency_ms: 42,
      error: null,
    }

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
