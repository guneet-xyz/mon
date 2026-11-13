import { describe, expect, it } from "bun:test"

import { monitorSummary } from "./monitor-summary"

const now = new Date("2026-11-13T12:00:00.000Z")

const container = {
  type: "container" as const,
  state: "running",
  health: "healthy",
  restartCount: 5,
  restarts24h: 2,
  startedAt: new Date("2026-11-07T09:00:00.000Z"),
  exitCode: 0,
  oomKilled: false,
  image: "cr.guneet.dev/mon/agent:v0.8.0",
  imageVersion: "0.8.0",
  cpu: 3.2,
  memory: 250_000_000,
  memoryLimit: 8_000_000_000,
}

describe("monitorSummary", () => {
  it("summarises a website", () => {
    expect(
      monitorSummary(
        {
          type: "website",
          latency: 140,
          statusCode: 302,
          redirectLocation: "/login",
          certExpiresAt: new Date("2026-12-22T06:38:07.000Z"),
        },
        now,
      ),
    ).toEqual([
      { label: "HTTP status", value: "302", detail: "→ /login" },
      { label: "Response time", value: "140 ms" },
      {
        label: "Certificate",
        value: "Expires in 38 days",
        detail: "2026-12-22",
      },
    ])
  })

  it("summarises a running container", () => {
    expect(monitorSummary(container, now)).toEqual([
      { label: "State", value: "running", detail: "health: healthy" },
      { label: "Up for", value: "6 d 3 h" },
      { label: "Restarts", value: "5", detail: "2 in 24 h" },
      { label: "CPU", value: "3%" },
      { label: "Memory", value: "250 MB", detail: "of 8.0 GB" },
      {
        label: "Image",
        value: "cr.guneet.dev/mon/agent:v0.8.0",
        detail: "0.8.0",
      },
    ])
  })

  it("shows how a stopped container exited", () => {
    const stats = monitorSummary(
      {
        ...container,
        state: "exited",
        health: null,
        exitCode: 137,
        oomKilled: true,
      },
      now,
    )
    expect(stats.map((s) => s.label)).toEqual([
      "State",
      "Restarts",
      "Image",
      "Last exit code",
    ])
    expect(stats.at(-1)).toEqual({
      label: "Last exit code",
      value: "137",
      detail: "killed: out of memory",
    })
  })

  it("leaves out values that were not recorded", () => {
    expect(monitorSummary({ type: "host", latency: null }, now)).toEqual([])
    expect(monitorSummary({ type: "github" }, now)).toEqual([])
  })
})
