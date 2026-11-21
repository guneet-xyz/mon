import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"

import { ConfigSchema } from "@mon/config/schema"
import { eq } from "@mon/db/drizzle"
import {
  hostPings,
  notificationState,
  systemPings,
  websitePings,
} from "@mon/db/schema"
import {
  createMockNotifyServer,
  createTestDb,
  type MockNotifyServer,
  type TestDb,
} from "@mon/test-utils"

import type * as Channels from "./channels"
import type * as Evaluate from "./evaluate"

let testDb: TestDb
let ntfy: MockNotifyServer
let webhook: MockNotifyServer
let evaluate: typeof Evaluate.evaluateNotifications
let channels: Channels.Channel[]

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000)
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

const config = ConfigSchema.parse({
  notifications: { board_url: "https://mon.example.com", mute: ["muted"] },
  tiles: [
    { type: "host", key: "web", address: "10.0.0.1", name: "Web" },
    { type: "host", key: "router", address: "10.0.0.2" },
    { type: "host", key: "muted", address: "10.0.0.3" },
    { type: "agent", key: "box" },
    { type: "website", key: "blog", url: "https://blog.example.com" },
  ],
})

const run = () =>
  evaluate({ config, channels, delivery: { baseDelayMs: 1, attempts: 4 } })

// Strictly increasing, so the latest ping is never ambiguous.
let last = 0
const tick = () => new Date((last = Math.max(Date.now(), last + 1)))

const ping = (key: string, error: string | null = null) =>
  testDb.db.insert(hostPings).values({
    key,
    timestamp: tick(),
    latency: error ? null : 5,
    error,
  })

const delivered = (server: MockNotifyServer) =>
  server.delivered.map((request) => {
    const body = request.json as Record<string, unknown>
    return (body.event ?? body.title) as string
  })

beforeAll(async () => {
  testDb = await createTestDb()
  ntfy = await createMockNotifyServer()
  webhook = await createMockNotifyServer()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))
  evaluate = (await import("./evaluate")).evaluateNotifications
  const { ntfyChannel, webhookChannel } = await import("./channels")
  channels = [
    ntfyChannel(`${ntfy.url}/mon-alerts`, "tk_secret"),
    webhookChannel(`${webhook.url}/hook`),
  ]
}, 120_000)

afterAll(async () => {
  await ntfy.stop()
  await webhook.stop()
  testDb.stop()
})

describe("evaluateNotifications", () => {
  it("does nothing without a channel or when disabled", async () => {
    await ping("web")
    expect(await evaluate({ config, channels: [] })).toEqual([])
    const disabled = ConfigSchema.parse({
      ...config,
      notifications: { enabled: false },
    })
    expect(await evaluate({ config: disabled, channels })).toEqual([])
    expect(await testDb.db.select().from(notificationState)).toEqual([])
  })

  it("seeds the current states silently on first start", async () => {
    await ping("router", "timeout")
    await ping("muted")
    await testDb.db
      .insert(systemPings)
      .values({ key: "box", timestamp: ago(1), cpuPercent: 5 })
    await testDb.db.insert(websitePings).values({
      key: "blog",
      timestamp: tick(),
      latency: 50,
      certExpiresAt: inDays(5),
    })

    expect(await run()).toEqual([])
    expect(ntfy.requests).toHaveLength(0)
    const rows = await testDb.db.select().from(notificationState)
    expect(
      Object.fromEntries(rows.map((row) => [row.key, row.notifiedStatus])),
    ).toEqual({
      web: "online",
      router: "offline",
      box: "online",
      blog: "online",
    })

    // Still down, warning unchanged: nothing new.
    await ping("router", "timeout")
    expect(await run()).toEqual([])
  })

  it("alerts once when a monitor goes down and once when it recovers", async () => {
    await ping("web", "timeout")
    const events = await run()
    expect(events.map((event) => [event.kind, event.monitor.key])).toEqual([
      ["down", "web"],
    ])
    expect(await run()).toEqual([])
    await ping("web", "timeout")
    expect(await run()).toEqual([])

    await ping("web")
    expect((await run()).map((event) => event.kind)).toEqual(["recovered"])
    expect(await run()).toEqual([])

    expect(delivered(webhook)).toEqual(["down", "recovered"])
    expect(ntfy.delivered.map((r) => r.json)).toEqual([
      {
        topic: "mon-alerts",
        title: "Web is down",
        message: expect.stringContaining("Host Web is down") as unknown,
        priority: 4,
        tags: ["rotating_light"],
        click: "https://mon.example.com",
      },
      expect.objectContaining({ title: "Web recovered" }) as unknown,
    ])
    expect(ntfy.delivered[0]?.headers.authorization).toBe("Bearer tk_secret")
  })

  it("alerts when an agent stops reporting", async () => {
    await testDb.db
      .update(systemPings)
      .set({ timestamp: ago(4) })
      .where(eq(systemPings.key, "box"))
    const events = await run()
    expect(events.map((event) => [event.kind, event.monitor.key])).toEqual([
      ["down", "box"],
    ])
    expect(events[0]?.message).toContain("stopped reporting")
    expect(await run()).toEqual([])
  })

  it("alerts on new warnings, not on ones it already knew", async () => {
    await testDb.db.insert(websitePings).values({
      key: "blog",
      timestamp: tick(),
      latency: 50,
      certExpiresAt: inDays(-1),
    })
    const events = await run()
    expect(events.map((event) => [event.kind, event.warnings])).toEqual([
      ["warning", ["Certificate expired"]],
    ])
    expect(await run()).toEqual([])
  })

  it("never alerts on muted monitors", async () => {
    await ping("muted", "timeout")
    expect(await run()).toEqual([])
  })

  it("sends one alert when two website instances evaluate at once", async () => {
    await ping("web", "refused")
    const [a, b] = await Promise.all([run(), run()])
    expect([...a, ...b].map((event) => event.kind)).toEqual(["down"])
    await ping("web")
    await run()
  })

  it("retries a failing channel and survives one that never works", async () => {
    const before = webhook.delivered.length
    webhook.setScenario({ kind: "flaky", times: 2, status: 503 })
    ntfy.setScenario({ kind: "http_error", status: 500 })
    const error = console.error
    const warn = console.warn
    console.error = () => undefined
    console.warn = () => undefined
    try {
      await ping("web", "timeout")
      expect((await run()).map((event) => event.kind)).toEqual(["down"])
    } finally {
      console.error = error
      console.warn = warn
    }
    expect(webhook.delivered.length).toBe(before + 1)
    expect(webhook.requests.length - webhook.delivered.length).toBe(2)
    // Not retried on the next pass: the alert is sent once per episode.
    ntfy.setScenario({ kind: "ok" })
    expect(await run()).toEqual([])
  })
})
