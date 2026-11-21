import { describe, expect, it } from "bun:test"

import type { MonitorDetails } from "@/lib/server/monitors/details"

import { monitorState } from "./monitor-state"

const now = new Date("2026-01-01T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)

const host: MonitorDetails = { type: "host", latency: 12 }
const agent: MonitorDetails = {
  type: "agent",
  cpu: 20,
  memory: 4e9,
  memoryTotal: 8e9,
  uptimeSeconds: 3600,
  disks: [],
  missingDisks: [],
}

describe("monitorState", () => {
  it("shows the current value when all is well", () => {
    expect(
      monitorState(
        {
          status: "online",
          details: host,
          warnings: [],
          lastCheck: { timestamp: ago(20_000), error: null },
          stale: false,
        },
        "host",
        now,
      ),
    ).toEqual({ tone: "ok", message: "12 ms" })
  })

  it("names the error of a monitor that is down", () => {
    expect(
      monitorState(
        {
          status: "offline",
          details: { ...host, latency: null },
          warnings: [],
          lastCheck: { timestamp: ago(20_000), error: "HTTP 503" },
          stale: false,
        },
        "website",
        now,
      ),
    ).toEqual({ tone: "down", message: "Down · HTTP 503" })
  })

  it("says how long a silent agent has been quiet instead of its old numbers", () => {
    expect(
      monitorState(
        {
          status: "offline",
          details: agent,
          warnings: [],
          lastCheck: { timestamp: ago(25 * 60_000), error: null },
          stale: true,
        },
        "agent",
        now,
      ),
    ).toEqual({ tone: "down", message: "No report for 25 min" })
  })

  it("shows the first warning and how many more there are", () => {
    expect(
      monitorState(
        {
          status: "online",
          details: agent,
          warnings: ["Disk (/) 93% full", "Memory 91% used"],
          lastCheck: { timestamp: ago(20_000), error: null },
          stale: false,
        },
        "agent",
        now,
      ),
    ).toEqual({ tone: "warning", message: "Disk (/) 93% full (+1)" })
  })

  it("tells apart no data from stale data", () => {
    const unknown = {
      status: "unknown" as const,
      details: host,
      warnings: [],
      stale: true,
    }
    expect(monitorState({ ...unknown, lastCheck: null }, "host", now)).toEqual({
      tone: "unknown",
      message: "No data yet",
    })
    expect(
      monitorState(
        {
          ...unknown,
          lastCheck: { timestamp: ago(2 * 3600_000), error: null },
        },
        "host",
        now,
      ),
    ).toEqual({ tone: "unknown", message: "No check for 2 h" })
  })
})
