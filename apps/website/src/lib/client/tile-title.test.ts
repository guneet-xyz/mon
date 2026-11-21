import { describe, expect, it } from "bun:test"

import { initialTitle, MIN_TITLE_SCALE, TITLE_SCALES } from "./tile-title"

describe("TITLE_SCALES", () => {
  it("tries the full size first and stops at the minimum", () => {
    expect(TITLE_SCALES[0]).toBe(1)
    expect(TITLE_SCALES.at(-1)).toBe(MIN_TITLE_SCALE)
    expect([...TITLE_SCALES].sort((a, b) => b - a)).toEqual(TITLE_SCALES)
  })
})

describe("initialTitle", () => {
  it("uses the initial of long names and keeps short ones", () => {
    expect(initialTitle("audiobookshelf")).toBe("A")
    expect(initialTitle("mon")).toBe("mon")
  })
})
