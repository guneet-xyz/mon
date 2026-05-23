import type { Tile } from "@mon/config/schema"

import { describe, expect, it } from "bun:test"

function makeTile(overrides: Partial<Tile> & { type: string }): Tile {
  return {
    type: overrides.type,
    row_start: overrides.row_start,
    row_span: overrides.row_span,
    col_start: overrides.col_start,
    col_span: overrides.col_span,
  } as Tile
}

function makeGrid(rows: number, cols: number): Array<Array<boolean>> {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => true),
  )
}

function placeTileHelper(
  grid: Array<Array<boolean>>,
  tile: Tile,
  tileIndex: number,
): {
  success: boolean
  location?: {
    row_start: number
    col_start: number
    row_span: number
    col_span: number
  }
  error?: string
} {
  const r_max = grid.length
  const c_max = grid[0]!.length

  const r_start =
    tile.row_start === undefined
      ? 1
      : tile.row_start > 0
        ? tile.row_start
        : r_max + tile.row_start + 1
  const r_span = tile.row_span ?? 1
  const r_end = tile.row_start ? r_start + r_span - 1 : r_max

  const c_start =
    tile.col_start === undefined
      ? 1
      : tile.col_start > 0
        ? tile.col_start
        : c_max + tile.col_start + 1

  const c_span = tile.col_span ?? 1
  const c_end = tile.col_start ? c_start + c_span - 1 : c_max

  for (let r = r_start; r <= r_end; r++) {
    for (let c = c_start; c <= c_end; c++) {
      let canFit = true
      if (r < 1 || c < 1 || r > r_max || c > c_max) {
        canFit = false
      } else {
        for (let rr = r; rr < r + r_span; rr++) {
          if (rr > r_max) {
            canFit = false
            break
          }
          for (let cc = c; cc < c + c_span; cc++) {
            if (cc > c_max) {
              canFit = false
              break
            }
            if (grid[rr - 1]![cc - 1] === false) {
              canFit = false
              break
            }
          }
          if (!canFit) break
        }
      }

      if (canFit) {
        for (let rr = r; rr < r + r_span; rr++) {
          for (let cc = c; cc < c + c_span; cc++) {
            grid[rr - 1]![cc - 1] = false
          }
        }
        return {
          success: true,
          location: {
            row_start: r,
            col_start: c,
            row_span: r_span,
            col_span: c_span,
          },
        }
      }
    }
  }

  return {
    success: false,
    error: `Could not fit tile at index ${tileIndex}`,
  }
}

describe("tile-generation grid placement", () => {
  it("places single tile with explicit positive col_start and row_start at exact coordinates", () => {
    const grid = makeGrid(5, 5)
    const tile = makeTile({
      type: "empty",
      row_start: 2,
      col_start: 3,
      row_span: 1,
      col_span: 1,
    })

    const result = placeTileHelper(grid, tile, 0)

    expect(result.success).toBe(true)
    expect(result.location).toEqual({
      row_start: 2,
      col_start: 3,
      row_span: 1,
      col_span: 1,
    })
    expect(grid[1]![2]).toBe(false)
  })

  it("places single tile with negative col_start relative to grid end", () => {
    const grid = makeGrid(5, 5)
    const tile = makeTile({
      type: "empty",
      row_start: 1,
      col_start: -1,
      row_span: 1,
      col_span: 1,
    })

    const result = placeTileHelper(grid, tile, 0)

    expect(result.success).toBe(true)
    expect(result.location?.col_start).toBe(5)
    expect(result.location?.row_start).toBe(1)
  })

  it("places tile with col_span and row_span occupying multiple cells", () => {
    const grid = makeGrid(5, 5)
    const tile = makeTile({
      type: "empty",
      row_start: 2,
      col_start: 2,
      row_span: 2,
      col_span: 3,
    })

    const result = placeTileHelper(grid, tile, 0)

    expect(result.success).toBe(true)
    expect(result.location).toEqual({
      row_start: 2,
      col_start: 2,
      row_span: 2,
      col_span: 3,
    })
    for (let r = 1; r < 3; r++) {
      for (let c = 1; c < 4; c++) {
        expect(grid[r]![c]).toBe(false)
      }
    }
  })

  it("handles collision: second tile cannot fit at requested position and fails", () => {
    const grid = makeGrid(5, 5)
    const tile1 = makeTile({
      type: "empty",
      row_start: 1,
      col_start: 1,
      row_span: 2,
      col_span: 2,
    })
    const tile2 = makeTile({
      type: "empty",
      row_start: 1,
      col_start: 1,
      row_span: 1,
      col_span: 1,
    })

    const result1 = placeTileHelper(grid, tile1, 0)
    expect(result1.success).toBe(true)

    const result2 = placeTileHelper(grid, tile2, 1)
    expect(result2.success).toBe(false)
  })

  it("auto-places tile with no explicit position to first available cell", () => {
    const grid = makeGrid(3, 3)
    const tile = makeTile({
      type: "empty",
      row_span: 1,
      col_span: 1,
    })

    const result = placeTileHelper(grid, tile, 0)

    expect(result.success).toBe(true)
    expect(result.location?.row_start).toBe(1)
    expect(result.location?.col_start).toBe(1)
  })

  it("auto-places tile to next available cell when first is occupied", () => {
    const grid = makeGrid(3, 3)
    const tile1 = makeTile({
      type: "empty",
      row_start: 1,
      col_start: 1,
      row_span: 1,
      col_span: 1,
    })
    const tile2 = makeTile({
      type: "empty",
      row_span: 1,
      col_span: 1,
    })

    const result1 = placeTileHelper(grid, tile1, 0)
    expect(result1.success).toBe(true)

    const result2 = placeTileHelper(grid, tile2, 1)
    expect(result2.success).toBe(true)
    expect(result2.location?.row_start).toBe(1)
    expect(result2.location?.col_start).toBe(2)
  })

  it("respects negative row_start for positioning from bottom", () => {
    const grid = makeGrid(5, 5)
    const tile = makeTile({
      type: "empty",
      row_start: -1,
      col_start: 1,
      row_span: 1,
      col_span: 1,
    })

    const result = placeTileHelper(grid, tile, 0)

    expect(result.success).toBe(true)
    expect(result.location?.row_start).toBe(5)
    expect(result.location?.col_start).toBe(1)
  })
})
