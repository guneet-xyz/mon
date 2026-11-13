import { describe, expect, it } from "bun:test"

import { fitTitle, initialTitle, MIN_TITLE_SCALE } from "./tile-title"

describe("fitTitle", () => {
  it("keeps names that fit at full size", () => {
    expect(fitTitle(200, 120)).toBe(1)
    expect(fitTitle(120, 120)).toBe(1)
  })

  it("scales slightly-too-wide names down", () => {
    expect(fitTitle(90, 100)).toBeCloseTo(0.9)
    expect(fitTitle(MIN_TITLE_SCALE * 100, 100)).toBeCloseTo(MIN_TITLE_SCALE)
  })

  it("falls back when the name would get too small", () => {
    expect(fitTitle(MIN_TITLE_SCALE * 100 - 1, 100)).toBeNull()
    expect(fitTitle(0, 100)).toBeNull()
  })

  it("keeps the full name until it can be measured", () => {
    expect(fitTitle(100, 0)).toBe(1)
  })
})

describe("initialTitle", () => {
  it("uses the initial of long names and keeps short ones", () => {
    expect(initialTitle("audiobookshelf")).toBe("A")
    expect(initialTitle("mon")).toBe("mon")
  })
})
