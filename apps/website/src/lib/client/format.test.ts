import { describe, expect, it } from "bun:test"

import {
  formatBytes,
  formatDuration,
  formatLatency,
  formatPercent,
  formatUptime,
} from "./format"

describe("format", () => {
  it("formats latency", () => {
    expect(formatLatency(12.4)).toBe("12 ms")
    expect(formatLatency(1234)).toBe("1.2 s")
    expect(formatLatency(15_000)).toBe("15 s")
    expect(formatLatency(null)).toBeNull()
  })

  it("formats percentages", () => {
    expect(formatPercent(3.4)).toBe("3%")
    expect(formatPercent(0.42)).toBe("0.4%")
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(undefined)).toBeNull()
  })

  it("formats bytes in decimal units", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(250_000_000)).toBe("250 MB")
    expect(formatBytes(1_234_000_000)).toBe("1.2 GB")
    expect(formatBytes(null)).toBeNull()
  })

  it("never rounds failures up to 100% uptime", () => {
    expect(formatUptime(1)).toBe("100%")
    expect(formatUptime(0.99999)).toBe("99.99%")
    expect(formatUptime(0.8)).toBe("80.0%")
    expect(formatUptime(null)).toBeNull()
  })

  it("formats durations", () => {
    const now = new Date("2026-11-13T12:00:00Z")
    const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
    expect(formatDuration(ago(35), now)).toBe("35 s")
    expect(formatDuration(ago(4 * 3600 + 12 * 60), now)).toBe("4 h 12 min")
    expect(formatDuration(ago(6 * 86_400 + 3 * 3600), now)).toBe("6 d 3 h")
    expect(formatDuration(ago(2 * 86_400), now)).toBe("2 d")
  })
})
