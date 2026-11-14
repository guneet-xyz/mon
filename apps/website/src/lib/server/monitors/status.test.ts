import { describe, expect, it } from "bun:test"

import {
  agentStatusFromLatestReport,
  groupStatus,
  NO_REPORT,
  reportGaps,
  STALE_AFTER_MS,
  statusFromLatestPing,
} from "./status"

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

describe("agentStatusFromLatestReport", () => {
  it("is offline once the agent goes quiet", () => {
    expect(agentStatusFromLatestReport(undefined, now)).toBe("unknown")
    expect(
      agentStatusFromLatestReport(
        { timestamp: minutesAgo(1), error: null },
        now,
      ),
    ).toBe("online")
    expect(
      agentStatusFromLatestReport(
        { timestamp: minutesAgo(4), error: null },
        now,
      ),
    ).toBe("offline")
    expect(
      agentStatusFromLatestReport(
        { timestamp: minutesAgo(1), error: "no system data" },
        now,
      ),
    ).toBe("offline")
  })
})

describe("reportGaps", () => {
  it("finds silences longer than the stale threshold", () => {
    const gaps = reportGaps(
      [minutesAgo(30), minutesAgo(29), minutesAgo(20), minutesAgo(19)],
      now,
    )
    expect(gaps).toEqual([
      { start: minutesAgo(29), end: minutesAgo(20), error: NO_REPORT },
      // Still silent now.
      { start: minutesAgo(19), end: now, error: NO_REPORT },
    ])
  })

  it("finds nothing while the agent keeps reporting", () => {
    expect(
      reportGaps([minutesAgo(3), minutesAgo(2), minutesAgo(1)], now),
    ).toEqual([])
    expect(reportGaps([], now)).toEqual([])
  })
})
