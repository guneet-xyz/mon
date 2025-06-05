import type { Config } from "@mon/config/schema"

export type Tile = (
  | { type: "hidden" }
  | { type: "empty" }
  | {
      type: "host"
      key: string
    }
  | {
      type: "website"
      key: string
    }
  | {
      type: "container"
      key: string
    }
) & {
  location: {
    row_start: number
    row_span: number
    col_start: number
    col_span: number
  }
}

function canTileFit({
  tiles_available,
  r_start,
  r_span,
  r_max,
  c_start,
  c_span,
  c_max,
}: {
  tiles_available: Array<Array<boolean>>
  r_start: number
  r_span: number
  r_max: number
  c_start: number
  c_span: number
  c_max: number
}): boolean {
  // 1-index inputs

  if (r_start < 1 || c_start < 1 || r_start > r_max || c_start > c_max)
    return false
  for (let r = r_start; r < r_start + r_span; r++) {
    if (r > r_max) return false
    for (let c = c_start; c < c_start + c_span; c++) {
      if (c > c_max) return false
      if (tiles_available[r - 1]![c - 1] === false) return false
    }
  }
  return true
}

export function generateTiles(config: Config):
  | {
      success: true
      tiles: Array<Tile>
      layout: { rows: number; cols: number }
    }
  | { success: false; error: string } {
  // 1-indexing throughout this function.

  const tiles: Array<Tile> = []

  const r_max = config.options.desktop.rows
  const c_max = config.options.desktop.columns

  console.log("r_max:", r_max, "c_max:", c_max)

  const tiles_available: Array<Array<boolean>> = Array.from(
    {
      length: config.options.desktop.rows,
    },
    () => Array.from({ length: config.options.desktop.columns }, () => true),
  )

  for (const [tile_index, tile] of config.tiles.entries()) {
    const tile_data =
      tile.type === "host" ||
      tile.type === "container" ||
      tile.type === "website"
        ? {
            type: tile.type,
            key: tile.key,
          }
        : tile.type === "empty"
          ? { type: "empty" as const }
          : { type: "hidden" as const }

    const r_start = tile.row_start ?? 1
    const r_span = tile.row_span ?? 1
    const r_end = tile.row_start ? tile.row_start + r_span : r_max

    const c_start = tile.col_start ?? 1
    const c_span = tile.col_span ?? 1
    const c_end = tile.col_start ? tile.col_start + c_span : c_max

    let found = false

    for (let r = r_start; r <= r_end; r++) {
      for (let c = c_start; c <= c_end; c++) {
        if (
          canTileFit({
            tiles_available,
            r_start: r,
            r_span: r_span,
            r_max: r_max,
            c_start: c,
            c_span: c_span,
            c_max: c_max,
          })
        ) {
          found = true

          for (let rr = r; rr < r + r_span; rr++) {
            for (let cc = c; cc < c + c_span; cc++) {
              tiles_available[rr - 1]![cc - 1] = false
            }
          }

          tiles.push({
            ...tile_data,
            location: {
              row_start: r,
              row_span: r_span,
              col_start: c,
              col_span: c_span,
            },
          })

          break
        }
      }
      if (found) break
    }

    if (!found) {
      return {
        success: false,
        error: `Could not fit tile at index ${tile_index} ${tile_data.key ? `( ${tile_data.key} ) ` : ""}for at row ${r_start}, column ${c_start} with span ${r_span}x${c_span}`,
      }
    }
  }

  for (let r = 1; r <= r_max; r++) {
    for (let c = 1; c <= c_max; c++) {
      if (tiles_available[r - 1]![c - 1]) {
        tiles.push({
          type: config.options.default_tile,
          location: {
            row_start: r,
            row_span: 1,
            col_start: c,
            col_span: 1,
          },
        })
        tiles_available[r - 1]![c - 1] = false
      }
    }
  }

  return { success: true, tiles, layout: { rows: r_max + 1, cols: c_max + 1 } }
}
