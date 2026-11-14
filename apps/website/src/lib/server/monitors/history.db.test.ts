import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"

import {
  containerPings,
  hostPings,
  systemPings,
  websitePings,
} from "@mon/db/schema"
import { createTestDb, type TestDb } from "@mon/test-utils"

import type * as Monitors from "."
import type * as Details from "./details"
import type * as History from "./history"

let testDb: TestDb
let history: typeof History
let details: typeof Details
let monitors: typeof Monitors

const now = new Date("2026-11-13T12:00:00.000Z")
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000)
const DAY = 24 * 60

beforeAll(async () => {
  testDb = await createTestDb()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))
  history = await import("./history")
  details = await import("./details")
  monitors = await import(".")

  await testDb.db.insert(hostPings).values([
    // One 5-minute bucket (11:50) averaging 20 ms, then one at 11:55.
    { key: "h", timestamp: at(10), latency: 10 },
    { key: "h", timestamp: at(9), latency: 20 },
    { key: "h", timestamp: at(8), latency: 30 },
    { key: "h", timestamp: at(4), latency: 40 },
    { key: "h", timestamp: at(2), latency: null, error: "timeout" },
    // Older failures, outside 24 h but inside 7 d.
    { key: "h", timestamp: at(3 * DAY), latency: null, error: "timeout" },
    { key: "h", timestamp: at(3 * DAY - 1), latency: null, error: "timeout" },
    // Outside every range.
    { key: "h", timestamp: at(40 * DAY), latency: 999 },
  ])

  await testDb.db.insert(websitePings).values([
    { key: "w", timestamp: at(5), latency: 100, statusCode: 200 },
    {
      key: "w",
      timestamp: at(1),
      latency: 120,
      statusCode: 302,
      redirectLocation: "/login",
      certExpiresAt: new Date("2026-11-20T00:00:00.000Z"),
    },
  ])

  const container = (
    minutesAgo: number,
    restartCount: number,
    cpu: number,
  ) => ({
    key: "c",
    timestamp: at(minutesAgo),
    state: "running",
    health: "healthy",
    restartCount,
    cpuPercent: cpu,
    memoryBytes: 200_000_000,
    memoryLimitBytes: 1_000_000_000,
  })
  await testDb.db
    .insert(containerPings)
    .values([
      container(20 * 60, 3, 10),
      container(9, 5, 20),
      container(8, 5, 40),
    ])
  // A recreated container: its restart counter went back to 0.
  await testDb.db.insert(containerPings).values([
    { key: "c2", timestamp: at(60), restartCount: 4, state: "running" },
    { key: "c2", timestamp: at(1), restartCount: 0, state: "running" },
  ])

  // An agent reporting every minute for the last 30 minutes, except for a
  // 10-minute silence (20 to 10 minutes ago).
  const reports = []
  for (let m = 30; m >= 1; m--) {
    if (m < 20 && m > 10) continue
    reports.push({
      key: "a",
      timestamp: at(m),
      cpuPercent: m <= 5 ? 50 : 10,
      memoryBytes: 4_000_000_000,
      memoryTotalBytes: 8_000_000_000,
      uptimeSeconds: 100_000 + (30 - m) * 60,
      disks: [
        { name: "/", usedBytes: 93, totalBytes: 100 },
        { name: "/mnt", usedBytes: 25, totalBytes: 100 },
      ],
    })
  }
  await testDb.db.insert(systemPings).values(reports)
}, 120_000)

afterAll(() => {
  testDb?.stop()
})

describe("monitor history", () => {
  it("averages latency into 5-minute buckets over 24 hours", async () => {
    const series = await history.getSeries("host", "h", "24h", now)
    expect(series?.map((p) => [p.timestamp.toISOString(), p.latency])).toEqual([
      ["2026-11-13T11:50:00.000Z", 20],
      ["2026-11-13T11:55:00.000Z", 40],
    ])
  })

  it("uses 30-minute buckets over 7 days", async () => {
    const series = await history.getSeries("host", "h", "7d", now)
    expect(series?.map((p) => p.timestamp.toISOString())).toEqual([
      "2026-11-10T12:00:00.000Z",
      "2026-11-13T11:30:00.000Z",
    ])
  })

  it("charts container CPU and memory", async () => {
    const series = await history.getSeries("container", "c", "24h", now)
    expect(series?.at(-1)).toMatchObject({
      cpu: 30,
      memory: 200_000_000,
      memoryLimit: 1_000_000_000,
    })
  })

  it("computes uptime per range", async () => {
    expect(await history.getUptime("host", "h", now)).toEqual({
      "24h": 0.8,
      "7d": 4 / 7,
      "30d": 4 / 7,
    })
    expect(await history.getUptime("host", "missing", now)).toEqual({
      "24h": null,
      "7d": null,
      "30d": null,
    })
  })

  it("lists incidents for the chosen range", async () => {
    const day = await history.getIncidentPings("host", "h", "24h", now)
    const week = await history.getIncidentPings("host", "h", "7d", now)
    expect(day).toHaveLength(1)
    expect(week).toHaveLength(3)
    // getIncidents uses the real clock, so only check it accepts a range.
    expect(Array.isArray(await monitors.getIncidents("host", "h", "30d"))).toBe(
      true,
    )
  })
})

describe("monitor details", () => {
  it("reports the latest website check", async () => {
    expect(await details.getMonitorDetails("website", "w", now)).toEqual({
      type: "website",
      latency: 120,
      statusCode: 302,
      redirectLocation: "/login",
      certExpiresAt: new Date("2026-11-20T00:00:00.000Z"),
    })
  })

  it("counts container restarts in the last 24 hours", async () => {
    expect(
      await details.getMonitorDetails("container", "c", now),
    ).toMatchObject({
      restartCount: 5,
      restarts24h: 2,
      cpu: 40,
      health: "healthy",
    })
    // A recreated container's counter reset is not a restart.
    expect(
      await details.getMonitorDetails("container", "c2", now),
    ).toMatchObject({ restartCount: 0, restarts24h: null })
  })

  it("reports null fields for monitors without details yet", async () => {
    expect(await details.getMonitorDetails("host", "missing", now)).toEqual({
      type: "host",
      latency: null,
    })
  })
})

describe("agent tiles", () => {
  it("charts CPU, memory and each disk", async () => {
    const series = await history.getSeries("agent", "a", "24h", now)
    expect(series?.at(-1)).toMatchObject({
      cpu: 50,
      memory: 4_000_000_000,
      memoryLimit: 8_000_000_000,
      disks: { "/": 93, "/mnt": 25 },
    })
  })

  it("counts silent 5-minute intervals against uptime", async () => {
    const uptime = await history.getUptime("agent", "a", now)
    // First report at 11:30; intervals 11:30-11:55 = 6, the silence leaves
    // 11:45 empty.
    expect(uptime["24h"]).toBeCloseTo(5 / 6)
    expect(uptime["7d"]).toBe(uptime["24h"])
    expect(await history.getUptime("agent", "nobody", now)).toEqual({
      "24h": null,
      "7d": null,
      "30d": null,
    })
  })

  it("finds the silence between reports", async () => {
    const { reportGaps, NO_REPORT } = await import("./status")
    const gaps = reportGaps(
      await history.getReportTimestamps("a", "24h", now),
      now,
    )
    expect(gaps).toEqual([{ start: at(20), end: at(10), error: NO_REPORT }])
  })

  it("reports the latest machine state and missing disks", async () => {
    expect(
      await details.getMonitorDetails("agent", "a", now, {
        disks: ["/", "/mnt", "/data"],
      }),
    ).toEqual({
      type: "agent",
      cpu: 50,
      memory: 4_000_000_000,
      memoryTotal: 8_000_000_000,
      uptimeSeconds: 100_000 + 29 * 60,
      disks: [
        { name: "/", used: 93, total: 100 },
        { name: "/mnt", used: 25, total: 100 },
      ],
      missingDisks: ["/data"],
    })
  })
})
