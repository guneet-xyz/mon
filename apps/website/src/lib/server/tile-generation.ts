import type { Config } from "@mon/config/schema"

export type Tile = (
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
  if (r_start < 0 || c_start < 0 || r_start > r_max || c_start > c_max)
    return false
  for (let r = r_start; r < r_start + r_span; r++) {
    if (r > r_max) return false
    for (let c = c_start; c < c_start + c_span; c++) {
      if (c > c_max) return false
      if (tiles_available[r]![c] === false) return false
    }
  }
  return true
}

export function generateTiles(
  config: Config,
): { success: true; tiles: Array<Tile> } | { success: false; error: string } {
  const tiles: Array<Tile> = []

  const r_max = config.options.desktop.rows - 1
  const c_max = config.options.desktop.columns - 1

  const tiles_available: Array<Array<boolean>> = Array.from(
    {
      length: config.options.desktop.rows,
    },
    () => Array.from({ length: config.options.desktop.columns }, () => true),
  )

  for (const host of config.hosts) {
    const r_start = host.row_start ?? 0
    const r_span = host.row_span ?? 1
    const r_end = host.row_start ? host.row_start + r_span : r_max

    const c_start = host.col_start ?? 0
    const c_span = host.col_span ?? 1
    const c_end = host.col_start ? host.col_start + c_span : c_max

    let found = false

    for (let r = r_start; r <= r_end; r++) {
      for (let c = c_start; c <= c_end; c++) {
        if (
          canTileFit({
            tiles_available,
            r_start: r_start,
            r_span: r_span,
            r_max: r_max,
            c_start: c_start,
            c_span: c_span,
            c_max: c_max,
          })
        ) {
          found = true

          for (let rr = r_start; rr < r_start + r_span; rr++) {
            for (let cc = c_start; cc < c_start + c_span; cc++) {
              tiles_available[rr]![cc] = false
            }
          }

          tiles.push({
            type: "host",
            key: host.key,
            location: {
              row_start: r_start,
              row_span: r_span,
              col_start: c_start,
              col_span: c_span,
            },
          })

          break
        }
      }
    }

    if (!found) {
      return {
        success: false,
        error: `Could not fit host tile for ${host.key} at row ${r_start}, column ${c_start} with span ${r_span}x${c_span}`,
      }
    }
  }

  for (let r = 0; r <= r_max; r++) {
    for (let c = 0; c <= c_max; c++) {
      if (tiles_available[r]![c]) {
        tiles.push({
          type: "empty",
          location: {
            row_start: r,
            row_span: 1,
            col_start: c,
            col_span: 1,
          },
        })
        tiles_available[r]![c] = false
      }
    }
  }

  return { success: true, tiles }
}
