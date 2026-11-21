import { describe, expect, test } from "bun:test"

import { ConfigSchema } from "@mon/config/schema"

import {
  decide,
  describeEvent,
  selectMonitors,
  warningKey,
  type NotificationState,
} from "./rules"

const t0 = new Date("2026-11-21T12:00:00.000Z")
const later = (seconds: number) => new Date(t0.getTime() + seconds * 1000)

const state = (
  overrides: Partial<NotificationState> = {},
): NotificationState => ({
  notifiedStatus: "online",
  observedStatus: "online",
  observedSince: t0,
  warnings: [],
  ...overrides,
})

describe("decide", () => {
  test("stores the first observation without an alert", () => {
    for (const status of ["online", "offline", "unknown"] as const) {
      const { next, events } = decide(
        undefined,
        { status, warnings: ["Disk / 95% full"] },
        0,
        t0,
      )
      expect(events).toEqual([])
      expect(next.notifiedStatus).toBe(status === "unknown" ? null : status)
      expect(next.warnings).toEqual(["Disk / #% full"])
    }
  })

  test("one alert per down episode and one recovery", () => {
    let current = state()
    const kinds: string[] = []
    const statuses = [
      "offline",
      "offline",
      "unknown",
      "offline",
      "online",
      "online",
    ] as const
    statuses.forEach((status, i) => {
      const { next, events } = decide(
        current,
        { status, warnings: null },
        0,
        later(i * 30),
      )
      kinds.push(...events.map((event) => event.kind))
      current = next
    })
    expect(kinds).toEqual(["down", "recovered"])
  })

  test("waits for the grace period before alerting", () => {
    const grace = 120_000
    const first = decide(
      state(),
      { status: "offline", warnings: null },
      grace,
      later(0),
    )
    expect(first.events).toEqual([])
    expect(first.next.observedSince).toEqual(later(0))
    const early = decide(
      first.next,
      { status: "offline", warnings: null },
      grace,
      later(90),
    )
    expect(early.events).toEqual([])
    const due = decide(
      early.next,
      { status: "offline", warnings: null },
      grace,
      later(120),
    )
    expect(due.events.map((event) => event.kind)).toEqual(["down"])
    expect(due.next.notifiedStatus).toBe("offline")
  })

  test("a blip shorter than the grace period sends nothing", () => {
    const down = decide(
      state(),
      { status: "offline", warnings: null },
      60_000,
      later(0),
    )
    const up = decide(
      down.next,
      { status: "online", warnings: null },
      60_000,
      later(30),
    )
    expect([...down.events, ...up.events]).toEqual([])
    expect(up.next.notifiedStatus).toBe("online")
  })

  test("a monitor first seen as unknown alerts when it goes down", () => {
    const seeded = decide(
      undefined,
      { status: "unknown", warnings: null },
      0,
      t0,
    )
    const down = decide(
      seeded.next,
      { status: "offline", warnings: null },
      0,
      later(30),
    )
    expect(down.events.map((event) => event.kind)).toEqual(["down"])
  })

  test("a monitor first seen as unknown comes online silently", () => {
    const seeded = decide(
      undefined,
      { status: "unknown", warnings: null },
      0,
      t0,
    )
    const up = decide(
      seeded.next,
      { status: "online", warnings: null },
      0,
      later(30),
    )
    expect(up.events).toEqual([])
    expect(up.next.notifiedStatus).toBe("online")
  })

  test("a monitor that was down at startup sends a recovery", () => {
    const seeded = decide(
      undefined,
      { status: "offline", warnings: null },
      0,
      t0,
    )
    const up = decide(
      seeded.next,
      { status: "online", warnings: null },
      0,
      later(30),
    )
    expect(up.events.map((event) => event.kind)).toEqual(["recovered"])
  })

  test("announces new warnings once, ignoring changing numbers", () => {
    const first = decide(
      state(),
      { status: "online", warnings: ["Certificate expires in 13 days"] },
      0,
      later(0),
    )
    expect(first.events).toEqual([
      { kind: "warning", warnings: ["Certificate expires in 13 days"] },
    ])
    const same = decide(
      first.next,
      { status: "online", warnings: ["Certificate expires in 1 day"] },
      0,
      later(30),
    )
    expect(same.events).toEqual([])
    const escalated = decide(
      same.next,
      { status: "online", warnings: ["Certificate expired"] },
      0,
      later(60),
    )
    expect(escalated.events).toEqual([
      { kind: "warning", warnings: ["Certificate expired"] },
    ])
  })

  test("a cleared warning that comes back is announced again", () => {
    const on = { status: "online" as const, warnings: ["Memory 95% used"] }
    const off = { status: "online" as const, warnings: [] }
    const a = decide(state(), on, 0, later(0))
    const b = decide(a.next, off, 0, later(30))
    const c = decide(b.next, on, 0, later(60))
    expect([...a.events, ...b.events, ...c.events]).toHaveLength(2)
  })

  test("keeps the stored warnings when warning alerts are off", () => {
    const { next, events } = decide(
      state({ warnings: ["Disk / #% full"] }),
      { status: "online", warnings: null },
      0,
      later(30),
    )
    expect(events).toEqual([])
    expect(next.warnings).toEqual(["Disk / #% full"])
  })
})

describe("warningKey", () => {
  test("drops the numbers from warning messages", () => {
    expect(warningKey("Disk root 91% full")).toBe("Disk root #% full")
    expect(warningKey("Restarted 3 times in 24 h")).toBe("Restarted # in # h")
    expect(warningKey("Restarted 1 time in 24 h")).toBe("Restarted # in # h")
    expect(warningKey("Health check failing")).toBe("Health check failing")
  })
})

describe("selectMonitors", () => {
  const tiles = [
    { type: "host", key: "router", address: "10.0.0.1" },
    { type: "host", key: "nas", address: "10.0.0.2" },
    { type: "website", key: "blog", url: "https://example.com" },
    { type: "agent", key: "box" },
    { type: "group", key: "inner", members: ["nas"] },
    { type: "group", key: "home", members: ["router", "inner"] },
  ]
  const keys = (notifications: object) =>
    selectMonitors(ConfigSchema.parse({ tiles, notifications })).map(
      (tile) => tile.key,
    )

  test("every monitor by default", () => {
    expect(keys({})).toEqual(["router", "nas", "blog", "box"])
  })

  test("include and mute accept monitors and nested groups", () => {
    expect(keys({ include: ["home"] })).toEqual(["router", "nas"])
    expect(keys({ include: ["home", "box"], mute: ["inner"] })).toEqual([
      "router",
      "box",
    ])
    expect(keys({ mute: ["blog"] })).toEqual(["router", "nas", "box"])
  })

  test("lists monitors that share a type and key once", () => {
    const config = ConfigSchema.parse({
      tiles: [
        { type: "host", key: "a", address: "10.0.0.1" },
        { type: "host", key: "a", address: "10.0.0.1", hidden: true },
      ],
    })
    expect(selectMonitors(config)).toHaveLength(1)
  })
})

describe("describeEvent", () => {
  const monitor = { type: "website" as const, key: "blog", name: "Blog" }

  test("down, recovered and warning messages", () => {
    expect(describeEvent({ kind: "down", warnings: [] }, monitor, t0)).toEqual({
      title: "Blog is down",
      message: "Website Blog is down (since 2026-11-21T12:00:00Z).",
    })
    expect(
      describeEvent({ kind: "recovered", warnings: [] }, monitor, t0).title,
    ).toBe("Blog recovered")
    expect(
      describeEvent(
        { kind: "warning", warnings: ["Certificate expired"] },
        monitor,
        t0,
      ),
    ).toEqual({
      title: "Blog: Certificate expired",
      message: "Website Blog: Certificate expired.",
    })
  })

  test("agents that go silent are described as such", () => {
    expect(
      describeEvent(
        { kind: "down", warnings: [] },
        { type: "agent", key: "box", name: "box" },
        t0,
      ).message,
    ).toBe(
      "Agent box is offline or has stopped reporting (since 2026-11-21T12:00:00Z).",
    )
  })
})
