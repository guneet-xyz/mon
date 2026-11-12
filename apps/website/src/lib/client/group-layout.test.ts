import type { PublicConfig, PublicGroupTile } from "@mon/config/schema"

import {
  bestSubgrid,
  generateTiles,
  layoutSubgrid,
  resolveGroupLayout,
} from "./tile-generation"

import { describe, expect, it } from "bun:test"

const member = (key: string, extra: Record<string, number> = {}) => ({
  key,
  type: "host" as const,
  ...extra,
})

const group = (
  members: PublicGroupTile["members"],
  extra: Partial<PublicGroupTile> = {},
): PublicGroupTile => ({ type: "group", key: "g", members, ...extra })

describe("bestSubgrid", () => {
  it("matches the expanded tile's shape", () => {
    expect(bestSubgrid(5, 2, 3)).toEqual({ rows: 2, cols: 3 })
    expect(bestSubgrid(6, 3, 2)).toEqual({ rows: 3, cols: 2 })
    expect(bestSubgrid(3, 1, 3)).toEqual({ rows: 1, cols: 3 })
  })

  it("stays close to the member count", () => {
    expect(bestSubgrid(4, 2, 2)).toEqual({ rows: 2, cols: 2 })
    expect(bestSubgrid(2, 1, 1)).toEqual({ rows: 1, cols: 2 })
    expect(bestSubgrid(1, 3, 3)).toEqual({ rows: 1, cols: 1 })
  })
})

describe("resolveGroupLayout", () => {
  it("defaults to a near-square span that fits every member", () => {
    const layout = resolveGroupLayout(
      group([member("a"), member("b"), member("c"), member("d"), member("e")]),
    )
    expect(layout).toMatchObject({
      row_span: 2,
      col_span: 3,
      rows: 2,
      cols: 3,
    })
  })

  it("never shrinks below the collapsed span", () => {
    const layout = resolveGroupLayout(
      group([member("a")], { row_span: 2, col_span: 2 }),
    )
    expect(layout).toMatchObject({ row_span: 2, col_span: 2 })
  })

  it("counts member spans as cells", () => {
    const layout = resolveGroupLayout(
      group([member("a", { col_span: 2 }), member("b"), member("c")]),
    )
    expect(layout).toMatchObject({ row_span: 2, col_span: 2 })
  })

  it("uses explicit sizes and derives the rest", () => {
    expect(
      resolveGroupLayout(
        group([member("a"), member("b"), member("c")], {
          expanded: { row_span: 1, col_span: 4, rows: 3 },
        }),
      ),
    ).toMatchObject({ row_span: 1, col_span: 4, rows: 3, cols: 1 })
    expect(
      resolveGroupLayout(
        group([member("a"), member("b"), member("c"), member("d")], {
          expanded: { col_span: 4 },
        }),
      ),
    ).toMatchObject({ row_span: 1, col_span: 4, rows: 1, cols: 4 })
  })
})

describe("layoutSubgrid", () => {
  it("places members with their own placement", () => {
    const subgrid = layoutSubgrid(
      group([member("a"), member("b", { row_start: 2, col_span: 2 })], {
        expanded: { rows: 2, cols: 2 },
      }),
    )
    expect(subgrid.success).toBe(true)
    if (!subgrid.success) return
    const location = (key: string) =>
      subgrid.tiles.find((t) => "key" in t && t.key === key)?.location
    expect(location("b")).toEqual({
      row_start: 2,
      row_span: 1,
      col_start: 1,
      col_span: 2,
    })
    expect(location("a")).toEqual({
      row_start: 1,
      row_span: 1,
      col_start: 1,
      col_span: 1,
    })
  })

  it("leaves free cells empty", () => {
    const subgrid = layoutSubgrid(
      group([member("a")], { expanded: { rows: 2, cols: 2 } }),
    )
    expect(subgrid.success && subgrid.tiles).toHaveLength(1)
  })

  it("grows a derived dimension when members do not pack", () => {
    // Area 8 in 3 columns suggests 3 rows, but two 2x2 members need 4.
    const subgrid = layoutSubgrid(
      group(
        [
          member("a", { row_span: 2, col_span: 2 }),
          member("b", { row_span: 2, col_span: 2 }),
        ],
        { expanded: { cols: 3 } },
      ),
    )
    expect(subgrid.success && [subgrid.rows, subgrid.cols]).toEqual([4, 3])
  })

  it("reports members that do not fit an explicit subgrid", () => {
    const subgrid = layoutSubgrid(
      group(
        [
          member("a", { row_start: 1, col_start: 1 }),
          member("b", { row_start: 1, col_start: 1 }),
        ],
        { expanded: { rows: 1, cols: 2 } },
      ),
    )
    expect(subgrid.success).toBe(false)
  })
})

describe("generateTiles with groups", () => {
  const config: PublicConfig = {
    options: {
      ping_interval_ms: 6000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      hide_grouped_tiles: true,
      desktop: { rows: 8, columns: 5 },
    },
    tiles: [
      { type: "host", key: "solo", address: "10.0.0.1" },
      group([member("a"), member("b"), member("c"), member("d")], {
        key: "g",
        expanded: { row_span: 2, col_span: 2 },
      }),
    ],
  }

  it("keeps a collapsed group at its collapsed span without a subgrid", () => {
    const result = generateTiles(config, 1000, 1000)
    if (!result.success) throw new Error(result.error)
    const tile = result.tiles.find((t) => t.type === "group")
    expect(tile?.location).toMatchObject({ row_span: 1, col_span: 1 })
    expect(tile && "subgrid" in tile && tile.subgrid).toBeFalsy()
  })

  it("reflows the board around an expanded group", () => {
    const result = generateTiles(config, 1000, 1000, new Set(["g"]))
    if (!result.success) throw new Error(result.error)
    const tile = result.tiles.find((t) => t.type === "group")
    expect(tile?.location).toMatchObject({ row_span: 2, col_span: 2 })
    if (tile?.type !== "group" || !tile.subgrid?.success)
      throw new Error("expected an expanded group")
    expect(tile.subgrid).toMatchObject({ rows: 2, cols: 2 })
    expect(tile.subgrid.tiles.map((t) => "key" in t && t.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
    expect(result.layout.rows * result.layout.cols).toBeGreaterThanOrEqual(5)
  })
})
