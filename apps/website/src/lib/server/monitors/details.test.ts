import { describe, expect, it } from "bun:test"

import { monitorWarnings, type MonitorDetails } from "./details"

const now = new Date("2026-11-13T12:00:00.000Z")
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)

const website = (certExpiresAt: Date | null): MonitorDetails => ({
  type: "website",
  latency: 100,
  statusCode: 200,
  redirectLocation: null,
  certExpiresAt,
})

const container = (
  overrides: Partial<Extract<MonitorDetails, { type: "container" }>>,
): MonitorDetails => ({
  type: "container",
  state: "running",
  health: "healthy",
  restartCount: 0,
  restarts24h: 0,
  startedAt: null,
  exitCode: 0,
  oomKilled: false,
  image: null,
  imageVersion: null,
  cpu: null,
  memory: null,
  memoryLimit: null,
  ...overrides,
})

describe("monitorWarnings", () => {
  it("warns about certificates expiring within 14 days", () => {
    expect(monitorWarnings(website(days(30)), now)).toEqual([])
    expect(monitorWarnings(website(days(13.5)), now)).toEqual([
      "Certificate expires in 13 days",
    ])
    expect(monitorWarnings(website(days(1.2)), now)).toEqual([
      "Certificate expires in 1 day",
    ])
    expect(monitorWarnings(website(days(-1)), now)).toEqual([
      "Certificate expired",
    ])
    expect(monitorWarnings(website(null), now)).toEqual([])
  })

  it("warns about unhealthy and restarting containers", () => {
    expect(monitorWarnings(container({}), now)).toEqual([])
    expect(monitorWarnings(container({ health: "unhealthy" }), now)).toEqual([
      "Health check failing",
    ])
    expect(
      monitorWarnings(container({ state: "restarting", restarts24h: 3 }), now),
    ).toEqual(["Restarting", "Restarted 3 times in 24 h"])
    expect(monitorWarnings(container({ restarts24h: 1 }), now)).toEqual([
      "Restarted 1 time in 24 h",
    ])
  })

  it("never warns about hosts", () => {
    expect(monitorWarnings({ type: "host", latency: 5 }, now)).toEqual([])
  })

  it("warns about full disks, missing disks and high memory", () => {
    const agent = (
      overrides: Partial<Extract<MonitorDetails, { type: "agent" }>>,
    ) =>
      monitorWarnings(
        {
          type: "agent",
          cpu: 5,
          memory: 4_000_000_000,
          memoryTotal: 8_000_000_000,
          uptimeSeconds: 3600,
          disks: [
            { name: "/", used: 26_000_000_000, total: 28_000_000_000 },
            { name: "/mnt", used: 40_000_000_000, total: 63_000_000_000 },
          ],
          missingDisks: [],
          ...overrides,
        },
        now,
      )
    expect(agent({})).toEqual(["Disk / 93% full"])
    expect(agent({ disks: [], missingDisks: ["/"] })).toEqual([
      "Disk / not reported",
    ])
    expect(agent({ disks: [], memory: 7_400_000_000 })).toEqual([
      "Memory 93% used",
    ])
  })
})
