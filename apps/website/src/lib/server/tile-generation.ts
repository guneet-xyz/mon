import type { Config, Tile } from "@mon/config/schema"

export type GeneratedTile = (
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

type IndexedTile = {
  index: number
  tile: Tile
}

function placeTile({
  tiles_available,
  placed_tiles,
  tile: { index: tile_index, tile },
}: {
  tiles_available: Array<Array<boolean>>
  placed_tiles: Array<GeneratedTile>
  tile: IndexedTile
}): { success: true } | { success: false; error: string } {
  const r_max = tiles_available.length
  const c_max = tiles_available[0]!.length

  const tile_data =
    tile.type === "host" || tile.type === "container" || tile.type === "website"
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
        for (let rr = r; rr < r + r_span; rr++) {
          for (let cc = c; cc < c + c_span; cc++) {
            tiles_available[rr - 1]![cc - 1] = false
          }
        }

        placed_tiles.push({
          ...tile_data,
          location: {
            row_start: r,
            row_span: r_span,
            col_start: c,
            col_span: c_span,
          },
        })

        return { success: true }
      }
    }
  }

  return {
    success: false,
    error: `Could not fit tile at index ${tile_index} ${tile_data.key ? `( ${tile_data.key} ) ` : ""}for at row ${r_start}, column ${c_start} with span ${r_span}x${c_span}`,
  }
}

function placeTiles({
  tiles_available,
  placed_tiles,
  tiles,
}: {
  tiles_available: Array<Array<boolean>>
  placed_tiles: Array<GeneratedTile>
  tiles: Array<IndexedTile>
}): { success: true } | { success: false; error: string } {
  for (const { index: tile_index, tile } of tiles) {
    const output = placeTile({
      tiles_available,
      placed_tiles,
      tile: { index: tile_index, tile },
    })

    if (output.success === false) {
      return { success: false, error: output.error }
    }
  }
  return { success: true }
}

function attemptLayout({
  priority_list_of_tiles,
  rows,
  cols,
  default_tile = "empty",
}: {
  priority_list_of_tiles: Array<Array<IndexedTile>>
  rows: number
  cols: number
  default_tile: "empty" | "hidden"
}):
  | {
      success: true
      tiles: Array<GeneratedTile>
    }
  | { success: false; error: string } {
  console.log(`Attempting layout with ${rows} rows and ${cols} columns.`)
  const r_max = rows
  const c_max = cols

  const placed_tiles: Array<GeneratedTile> = []

  const tiles_available: Array<Array<boolean>> = Array.from(
    {
      length: rows,
    },
    () => Array.from({ length: cols }, () => true),
  )

  for (const tiles of priority_list_of_tiles) {
    const output = placeTiles({
      tiles_available,
      placed_tiles,
      tiles: tiles,
    })

    if (output.success === false) {
      return { success: false, error: output.error }
    }
  }

  for (let r = 1; r <= r_max; r++) {
    for (let c = 1; c <= c_max; c++) {
      if (tiles_available[r - 1]![c - 1]) {
        placed_tiles.push({
          type: default_tile,
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

  return { success: true, tiles: placed_tiles }
}

export function generateTiles(config: Config):
  | {
      success: true
      tiles: Array<GeneratedTile>
      layout: { rows: number; cols: number }
    }
  | { success: false; error: string } {
  // 1-indexing throughout this function.

  const tiles_input = config.tiles.map((tile, index) => ({
    index: index,
    tile: tile,
  }))

  const tiles_added_to_priority_list = new Set<number>()

  const priority_list_of_tiles: Array<typeof tiles_input> = []
  function addToPriorityList(tiles: typeof tiles_input) {
    const tiles_to_add: typeof tiles = []
    for (const tile of tiles) {
      if (tiles_added_to_priority_list.has(tile.index)) continue
      tiles_added_to_priority_list.add(tile.index)
      tiles_to_add.push(tile)
    }
    priority_list_of_tiles.push(tiles_to_add)
  }

  addToPriorityList(
    tiles_input.filter(
      ({ tile }) => tile.type === "empty" || tile.type === "hidden",
    ),
  )

  addToPriorityList(
    tiles_input.filter(
      ({ tile }) =>
        tile.row_start !== undefined || tile.col_start !== undefined,
    ),
  )

  addToPriorityList(
    tiles_input.filter(
      ({ tile }) => tile.row_span !== undefined || tile.col_span !== undefined,
    ),
  )

  addToPriorityList(tiles_input)

  let rows = 1
  let cols = 1

  let placed_tiles: Array<GeneratedTile> | undefined = undefined

  while (rows < 20 && cols < 20) {
    const attempt = attemptLayout({
      priority_list_of_tiles,
      rows,
      cols,
      default_tile: config.options.default_tile,
    })
    if (attempt.success) {
      placed_tiles = attempt.tiles
      break
    }
    rows++
    cols++
  }

  if (rows >= 100 || cols >= 100) {
    return {
      success: false,
      error: `Could not fit tiles in a reasonable layout. Tried up to ${rows} rows and ${cols} columns.`,
    }
  }

  if (!placed_tiles) {
    return {
      success: false,
      error: "No tiles were placed, something went wrong.",
    }
  }

  while (true) {
    let attempt = attemptLayout({
      priority_list_of_tiles,
      rows: rows - 1,
      cols,
      default_tile: config.options.default_tile,
    })
    if (attempt.success) {
      rows--
      placed_tiles = attempt.tiles
      continue
    }

    attempt = attemptLayout({
      priority_list_of_tiles,
      rows,
      cols: cols - 1,
      default_tile: config.options.default_tile,
    })

    if (attempt.success) {
      cols--
      placed_tiles = attempt.tiles
      continue
    }

    break
  }

  return {
    success: true,
    tiles: placed_tiles,
    layout: { rows: rows, cols: cols },
  }
}
