import { STALE_AFTER_MS, groupStatus, statusFromLatestPing } from "./status"

import { describe, expect, it } from "bun:test"

const now = new Date("2026-11-10T12:00:00Z")
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

describe("statusFromLatestPing", () => {
  it("is unknown without a ping", () => {
    expect(statusFromLatestPing(undefined, now)).toBe("unknown")
  })

  it("is online for a recent successful ping", () => {
    expect(
      statusFromLatestPing({ timestamp: minutesAgo(1), error: null }, now),
    ).toBe("online")
  })

  it("stays known right up to the threshold", () => {
    const edge = new Date(now.getTime() - STALE_AFTER_MS)
    expect(statusFromLatestPing({ timestamp: edge, error: null }, now)).toBe(
      "online",
    )
  })

  it("is offline for a recent failed ping", () => {
    expect(
      statusFromLatestPing({ timestamp: minutesAgo(1), error: "timeout" }, now),
    ).toBe("offline")
  })

  it("is unknown once the latest ping is stale", () => {
    const stale = new Date(now.getTime() - STALE_AFTER_MS - 1)
    expect(statusFromLatestPing({ timestamp: stale, error: null }, now)).toBe(
      "unknown",
    )
    expect(
      statusFromLatestPing({ timestamp: stale, error: "timeout" }, now),
    ).toBe("unknown")
  })
})

describe("groupStatus", () => {
  it("is online when every member is online", () => {
    expect(groupStatus(["online", "online"])).toBe("online")
  })

  it("is offline when any member is offline", () => {
    expect(groupStatus(["online", "unknown", "offline"])).toBe("offline")
  })

  it("is unknown when a member is unknown and none is offline", () => {
    expect(groupStatus(["online", "unknown"])).toBe("unknown")
  })

  it("is unknown without members", () => {
    expect(groupStatus([])).toBe("unknown")
  })
})
