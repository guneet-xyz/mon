import { describe, expect, it } from "bun:test"

import { groupMessage, groupTone, summarize, toneOf } from "./tile-state"

describe("toneOf", () => {
  it("puts down and silent monitors before warnings", () => {
    expect(toneOf("offline", 2)).toBe("down")
    expect(toneOf("unknown", 1)).toBe("unknown")
    expect(toneOf("online", 1)).toBe("warning")
    expect(toneOf("online", 0)).toBe("ok")
  })
})

describe("group summaries", () => {
  it("count monitors and surface the worst state", () => {
    const summary = summarize([
      { status: "online", warnings: 0 },
      { status: "online", warnings: 2 },
      { status: "offline", warnings: 0 },
      { status: "unknown", warnings: 0 },
    ])
    expect(summary).toEqual({
      total: 4,
      up: 2,
      down: 1,
      unknown: 1,
      warnings: 1,
    })
    expect(groupTone(summary)).toBe("down")
    expect(groupMessage(summary)).toBe("1 down · 1 warning · 1 no data")
  })

  it("show a warning when every monitor is up", () => {
    const summary = summarize([
      { status: "online", warnings: 0 },
      { status: "online", warnings: 1 },
      { status: "online", warnings: 1 },
    ])
    expect(groupTone(summary)).toBe("warning")
    expect(groupMessage(summary)).toBe("2 warnings")
  })

  it("show the up count when all is well", () => {
    const summary = summarize([
      { status: "online", warnings: 0 },
      { status: "online", warnings: 0 },
    ])
    expect(groupTone(summary)).toBe("ok")
    expect(groupMessage(summary)).toBe("2/2 up")
  })

  it("treat an empty group as unknown", () => {
    expect(groupTone(summarize([]))).toBe("unknown")
    expect(groupMessage(summarize([]))).toBe("No monitors")
  })
})
