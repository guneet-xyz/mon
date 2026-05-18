import type { ContainerPingDTO } from "@mon/contracts"

import { insertContainerPing } from "./container"

import { describe, expect, it, mock } from "bun:test"

describe("insertContainerPing", () => {
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

    const { insertContainerPing: fn } = await import("./container")

    const dto: ContainerPingDTO = {
      kind: "container",
      ping_id: "test-id",
      daemon_id: "daemon-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "container-1",
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

    const { insertContainerPing: fn } = await import("./container")

    const dto: ContainerPingDTO = {
      kind: "container",
      ping_id: "test-id",
      daemon_id: "daemon-1",
      recorded_at: "2026-05-18T12:00:00Z",
      key: "container-1",
      error: null,
    }

    const result = await fn(dto)
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
