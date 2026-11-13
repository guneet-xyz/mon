import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"

import type { ContainerPingDTO, WebsitePingDTO } from "@mon/contracts"
import { eq } from "@mon/db/drizzle"
import { containerPings, websitePings } from "@mon/db/schema"
import { createTestDb, type TestDb } from "@mon/test-utils"

import { insertContainerPing } from "./container"
import { insertWebsitePing } from "./website"

// Stores the details agents send from v0.8.0 and still accepts the shorter
// pings older agents send.

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))
}, 120_000)

afterAll(() => {
  testDb?.stop()
})

const base = {
  agent_id: "agent-1",
  recorded_at: "2026-11-13T12:00:00.000Z",
  error: null,
}

describe("monitor details against Postgres", () => {
  it("stores website details", async () => {
    const dto: WebsitePingDTO = {
      ...base,
      kind: "website",
      ping_id: crypto.randomUUID(),
      key: "site",
      latency_ms: 120,
      status_code: 302,
      redirect_location: "/login",
      cert_expires_at: "2027-01-30T17:58:47.000Z",
    }
    await insertWebsitePing(dto, { db: testDb.db })
    const [row] = await testDb.db
      .select()
      .from(websitePings)
      .where(eq(websitePings.pingId, dto.ping_id))
    expect(row).toMatchObject({
      statusCode: 302,
      redirectLocation: "/login",
      certExpiresAt: new Date("2027-01-30T17:58:47.000Z"),
    })
  })

  it("stores container details", async () => {
    const dto: ContainerPingDTO = {
      ...base,
      kind: "container",
      ping_id: crypto.randomUUID(),
      key: "ctr",
      state: "running",
      health: "healthy",
      restart_count: 2,
      started_at: "2026-11-13T10:00:00.000Z",
      exit_code: 0,
      oom_killed: false,
      image: "cr.guneet.dev/mon/agent:v0.8.0",
      image_version: "0.8.0",
      cpu_percent: 12.5,
      memory_bytes: 250_000_000,
      memory_limit_bytes: 8_000_000_000,
    }
    await insertContainerPing(dto, { db: testDb.db })
    const [row] = await testDb.db
      .select()
      .from(containerPings)
      .where(eq(containerPings.pingId, dto.ping_id))
    expect(row).toMatchObject({
      state: "running",
      health: "healthy",
      restartCount: 2,
      startedAt: new Date("2026-11-13T10:00:00.000Z"),
      oomKilled: false,
      imageVersion: "0.8.0",
      cpuPercent: 12.5,
      memoryBytes: 250_000_000,
      memoryLimitBytes: 8_000_000_000,
    })
  })

  it("accepts pings from older agents without details", async () => {
    const dto: ContainerPingDTO = {
      ...base,
      kind: "container",
      ping_id: crypto.randomUUID(),
      key: "ctr-old",
    }
    await insertContainerPing(dto, { db: testDb.db })
    const [row] = await testDb.db
      .select()
      .from(containerPings)
      .where(eq(containerPings.pingId, dto.ping_id))
    expect(row).toMatchObject({ state: null, cpuPercent: null })
  })
})
