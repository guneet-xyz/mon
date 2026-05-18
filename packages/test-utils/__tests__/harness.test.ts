import { hostPings } from "@mon/db/schema"

import { createTestDb } from "../index"

import { afterAll, describe, expect, it } from "bun:test"

describe("ephemeral Postgres harness", () => {
  let stop: (() => void) | undefined

  afterAll(() => {
    stop?.()
  })

  it("starts, migrates, and accepts queries", async () => {
    const testDb = await createTestDb()
    stop = testDb.stop

    const rows = await testDb.db.select().from(hostPings).limit(1)
    expect(Array.isArray(rows)).toBe(true)
  }, 60_000)
})
