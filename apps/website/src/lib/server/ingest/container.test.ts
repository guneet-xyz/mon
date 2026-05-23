import type { ContainerPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"

import { insertContainerPing } from "./container"

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

const dto: ContainerPingDTO = {
  kind: "container",
  ping_id: "test-id",
  agent_id: "agent-1",
  recorded_at: "2026-05-18T12:00:00Z",
  key: "container-1",
  error: null,
}

describe("insertContainerPing", () => {
  it("returns deduplicated: false on first insert", async () => {
    const db = makeMockDb(async () => [{ pingId: "test-id" }])
    const result = await insertContainerPing(dto, { db })
    expect(result).toEqual({ ok: true, deduplicated: false })
  })

  it("returns deduplicated: true on duplicate insert", async () => {
    const db = makeMockDb(async () => [])
    const result = await insertContainerPing(dto, { db })
    expect(result).toEqual({ ok: true, deduplicated: true })
  })
})
