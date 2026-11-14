import { describe, expect, it } from "bun:test"

import { tileValue } from "./tile-value"

const container = {
  type: "container" as const,
  state: "running",
  health: null,
  restartCount: 0,
  restarts24h: 0,
  startedAt: null,
  exitCode: 0,
  oomKilled: false,
  image: null,
  imageVersion: null,
  cpu: 3.2,
  memory: 250_000_000,
  memoryLimit: null,
}

describe("tileValue", () => {
  it("shows latency for hosts and websites", () => {
    expect(tileValue({ type: "host", latency: 12.3 })).toBe("12 ms")
    expect(
      tileValue({
        type: "website",
        latency: 140,
        statusCode: 200,
        redirectLocation: null,
        certExpiresAt: null,
      }),
    ).toBe("140 ms")
  })

  it("shows CPU and memory for running containers", () => {
    expect(tileValue(container)).toBe("3% · 250 MB")
    expect(tileValue({ ...container, cpu: null })).toBe("250 MB")
  })

  it("shows the state of stopped containers", () => {
    expect(tileValue({ ...container, state: "exited" })).toBe("exited")
  })

  it("shows nothing before an agent records details", () => {
    expect(tileValue({ type: "host", latency: null })).toBeNull()
    expect(
      tileValue({ ...container, state: null, cpu: null, memory: null }),
    ).toBeNull()
    expect(tileValue(undefined)).toBeNull()
  })
})

describe("tileValue for agents", () => {
  const agent = {
    type: "agent" as const,
    cpu: 12.3,
    memory: 4_640_000_000,
    memoryTotal: 8_000_000_000,
    uptimeSeconds: 3600,
    disks: [
      { name: "/", used: 93, total: 100 },
      { name: "/mnt", used: 73, total: 100 },
    ],
    missingDisks: [],
  }

  it("shows CPU, memory and the fullest disk", () => {
    expect(tileValue(agent)).toBe("CPU 12% · MEM 58% · DISK 93%")
  })

  it("leaves out what was not reported", () => {
    expect(tileValue({ ...agent, cpu: null, disks: [] })).toBe("MEM 58%")
    expect(
      tileValue({ ...agent, cpu: null, memory: null, disks: [] }),
    ).toBeNull()
  })
})
