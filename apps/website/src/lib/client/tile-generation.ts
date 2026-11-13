import type {
  MonitorTile,
  NonMonitorTile,
  PublicConfig,
  PublicGroupMember,
  PublicGroupTile,
  PublicTile,
} from "@mon/config/schema"

const MAX_RATIO = 1.25

type Location = {
  row_start: number
  row_span: number
  col_start: number
  col_span: number
}

export type Subgrid =
  | { success: true; rows: number; cols: number; tiles: Array<GeneratedTile> }
  | { success: false; error: string }

export type GeneratedTile = (
  | { type: MonitorTile["type"]; key: string }
  // `subgrid` is set only while the group is expanded.
  | { type: "group"; key: string; subgrid?: Subgrid }
  | { type: NonMonitorTile["type"] }
) & {
  location: Location
}

// Stable identity of a tile across layouts, so React moves it instead of
// remounting it and the animation can follow it.
export function tileId(tile: GeneratedTile): string {
  if ("key" in tile) return `${tile.type}:${tile.key}`
  const { row_start, col_start } = tile.location
  return `${tile.type}:${row_start}:${col_start}`
}

// Anything that can be placed on a grid: main-grid tiles and group members.
type Placeable = PublicTile | PublicGroupMember

type Anchor = { row: number; col: number }

type IndexedTile = {
  index: number
  tile: Placeable
  // While any group is expanded, tiles are anchored to the cell they occupy
  // on the collapsed board: expanded groups grow from it, and other tiles
  // stay on it unless an expanded group covers it.
  anchor?: Anchor
  stay?: boolean
}

// Top-left cells for a r_span x c_span tile, nearest to `anchor` first: cells
// whose area covers the anchor come first, preferring the anchor as top-left
// (growing right and down), then shifting as little as possible.
function anchoredCandidates(
  anchor: Anchor,
  r_span: number,
  c_span: number,
  r_max: number,
  c_max: number,
): Array<[number, number]> {
  const ar = Math.min(anchor.row, r_max)
  const ac = Math.min(anchor.col, c_max)
  const outside = (start: number, span: number, at: number) =>
    Math.max(0, start - at, at - (start + span - 1))
  const candidates: Array<[number, number, number, number]> = []
  for (let r = 1; r <= r_max; r++) {
    for (let c = 1; c <= c_max; c++) {
      candidates.push([
        r,
        c,
        outside(r, r_span, ar) + outside(c, c_span, ac),
        Math.abs(r - ar) + Math.abs(c - ac),
      ])
    }
  }
  candidates.sort(
    (a, b) => a[2] - b[2] || a[3] - b[3] || a[0] - b[0] || a[1] - b[1],
  )
  return candidates.map(([r, c]) => [r, c])
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

function placeTile({
  tiles_available,
  placed_tiles,
  tile: { index: tile_index, tile, anchor },
}: {
  tiles_available: Array<Array<boolean>>
  placed_tiles: Array<GeneratedTile>
  tile: IndexedTile
}): { success: true } | { success: false; error: string } {
  const r_max = tiles_available.length
  const c_max = tiles_available[0]!.length

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

  const candidates: Array<[number, number]> = []
  if (anchor) {
    candidates.push(...anchoredCandidates(anchor, r_span, c_span, r_max, c_max))
  } else {
    for (let r = r_start; r <= r_end; r++) {
      for (let c = c_start; c <= c_end; c++) candidates.push([r, c])
    }
  }

  for (const [r, c] of candidates) {
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
        ...tile,
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

  return {
    success: false,
    error: `Could not fit tile at index ${tile_index} ${"key" in tile ? `( ${tile.key} ) ` : ""}for at row ${r_start}, column ${c_start} with span ${r_span}x${c_span}`,
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
  // Tiles that can stay exactly where they were go first, so a displaced
  // tile never takes a cell another tile is still sitting on.
  const remaining: Array<IndexedTile> = []
  for (const tile of tiles) {
    const { anchor, tile: t } = tile
    if (
      tile.stay &&
      anchor &&
      canTileFit({
        tiles_available,
        r_start: anchor.row,
        r_span: t.row_span ?? 1,
        r_max: tiles_available.length,
        c_start: anchor.col,
        c_span: t.col_span ?? 1,
        c_max: tiles_available[0]!.length,
      })
    ) {
      placeTile({
        tiles_available,
        placed_tiles,
        tile: { ...tile, anchor },
      })
    } else {
      remaining.push(tile)
    }
  }

  for (const tile of remaining) {
    const output = placeTile({
      tiles_available,
      placed_tiles,
      tile,
    })

    if (output.success === false) {
      return { success: false, error: output.error }
    }
  }
  return { success: true }
}

const placeableId = (tile: Placeable) =>
  "key" in tile ? `${tile.type}:${tile.key}` : undefined

// Placement order: empty/hidden placeholders, then tiles with a fixed start,
// then expanded groups, then other anchored tiles, then tiles with a span,
// then the rest, each in config order.
function prioritize(
  tiles: Array<Placeable>,
  anchors: ReadonlyMap<string, Anchor> = new Map(),
  expanding: ReadonlySet<string> = new Set(),
): Array<Array<IndexedTile>> {
  const tiles_input: Array<IndexedTile> = tiles.map((tile, index) => {
    const id = placeableId(tile)
    const anchor =
      id !== undefined &&
      tile.row_start === undefined &&
      tile.col_start === undefined
        ? anchors.get(id)
        : undefined
    return {
      index,
      tile,
      anchor,
      stay: anchor !== undefined && !expanding.has(id!),
    }
  })
  const added = new Set<number>()
  const priority_list_of_tiles: Array<Array<IndexedTile>> = []
  function addToPriorityList(tiles: Array<IndexedTile>) {
    const tiles_to_add: Array<IndexedTile> = []
    for (const tile of tiles) {
      if (added.has(tile.index)) continue
      added.add(tile.index)
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
    tiles_input.filter(({ anchor, stay }) => anchor !== undefined && !stay),
  )

  addToPriorityList(tiles_input.filter(({ stay }) => stay))

  addToPriorityList(
    tiles_input.filter(
      ({ tile }) => tile.row_span !== undefined || tile.col_span !== undefined,
    ),
  )

  addToPriorityList(tiles_input)

  return priority_list_of_tiles
}

function attemptLayout({
  priority_list_of_tiles,
  rows,
  cols,
  default_tile,
}: {
  priority_list_of_tiles: Array<Array<IndexedTile>>
  rows: number
  cols: number
  // Fills free cells; null leaves them empty (group subgrids).
  default_tile: "empty" | "hidden" | null
}):
  | {
      success: true
      tiles: Array<GeneratedTile>
    }
  | { success: false; error: string } {
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

  if (default_tile === null) return { success: true, tiles: placed_tiles }

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

function memberArea(members: Array<PublicGroupMember>): number {
  return members.reduce(
    (sum, member) => sum + (member.row_span ?? 1) * (member.col_span ?? 1),
    0,
  )
}

// The rows x cols grid closest to `area` cells whose cells keep the shape of
// the parent cells, i.e. rows / cols is as close as possible to
// row_span / col_span.
export function bestSubgrid(
  area: number,
  row_span: number,
  col_span: number,
): { rows: number; cols: number } {
  let best = { rows: 1, cols: Math.max(1, area) }
  let bestScore = Infinity
  for (let rows = 1; rows <= Math.max(1, area); rows++) {
    const cols = Math.max(1, Math.ceil(area / rows))
    const shape = Math.abs(Math.log((cols * row_span) / (rows * col_span)))
    const waste = (rows * cols - area) / Math.max(1, area)
    const score = shape + waste
    if (score < bestScore - 1e-9) {
      best = { rows, cols }
      bestScore = score
    }
  }
  return best
}

export type GroupLayout = {
  // Size of the expanded group on the grid it sits in.
  row_span: number
  col_span: number
  subgrid: Subgrid
}

const MAX_GROUP_ATTEMPTS = 200

// Lays out an expanded group: its size on the grid it sits in and the subgrid
// of its members, recursing into nested groups that are expanded too.
//
// Sizing, per dimension, unless `expanded` fixes it:
// - the group starts at the near-square size its members need, at least its
//   collapsed size and min_*_span, at most max_*_span;
// - the subgrid is the grid closest to the members' cell count whose cells
//   keep the group's proportions (bestSubgrid);
// - if the members do not fit (a nested group expanded inside it), the group
//   grows up to max_*_span with one subgrid cell per parent cell, and past
//   that its subgrid gains rows/columns, so its tiles shrink.
// Fixed rows/cols, or a fixed row_span and col_span, keep their old meaning:
// the subgrid is derived and only its derived dimension grows.
//
// Nested groups expand in place: tiles are anchored to their cells in the
// subgrid with nested groups collapsed, like the main board.
export function layoutGroup(
  group: PublicGroupTile,
  groups: Readonly<Record<string, PublicGroupTile>>,
  expandedGroups: ReadonlySet<string>,
  collapsed: { row_span: number; col_span: number } = {
    row_span: group.row_span ?? 1,
    col_span: group.col_span ?? 1,
  },
  ancestors: ReadonlySet<string> = new Set(),
): GroupLayout {
  const lineage = new Set([...ancestors, group.key])

  // Expanded nested groups take their own expanded size in this subgrid.
  const childSubgrids = new Map<string, Subgrid>()
  const members = group.members.map((member): PublicGroupMember => {
    const nested = member.type === "group" ? groups[member.key] : undefined
    if (!nested || !expandedGroups.has(member.key) || lineage.has(member.key)) {
      return member
    }
    const child = layoutGroup(
      nested,
      groups,
      expandedGroups,
      { row_span: member.row_span ?? 1, col_span: member.col_span ?? 1 },
      lineage,
    )
    childSubgrids.set(member.key, child.subgrid)
    return { ...member, row_span: child.row_span, col_span: child.col_span }
  })
  const area = memberArea(members)
  const expanded = group.expanded ?? {}

  const bounds = (dim: "row" | "col") => {
    const fixed = expanded[`${dim}_span`]
    if (fixed !== undefined) return { lo: fixed, hi: fixed }
    const hi = expanded[`max_${dim}_span`] ?? Infinity
    const lo = Math.max(
      expanded[`min_${dim}_span`] ?? 1,
      collapsed[`${dim}_span`],
    )
    return { lo: Math.min(lo, hi), hi }
  }
  const clamp = (n: number, { lo, hi }: { lo: number; hi: number }) =>
    Math.min(Math.max(n, lo), hi)
  const rowBounds = bounds("row")
  const colBounds = bounds("col")

  let col_span = clamp(Math.ceil(Math.sqrt(area)), colBounds)
  let row_span = clamp(Math.ceil(area / col_span), rowBounds)
  if (rowBounds.lo === rowBounds.hi) {
    col_span = clamp(Math.ceil(area / row_span), colBounds)
  }

  const fixedRows = expanded.rows !== undefined
  const fixedCols = expanded.cols !== undefined
  const derivedOnly =
    fixedRows ||
    fixedCols ||
    (expanded.row_span !== undefined && expanded.col_span !== undefined)

  let rows: number
  let cols: number
  if (fixedRows || fixedCols) {
    rows = expanded.rows ?? Math.max(1, Math.ceil(area / expanded.cols!))
    cols = expanded.cols ?? Math.max(1, Math.ceil(area / rows))
  } else {
    ;({ rows, cols } = bestSubgrid(area, row_span, col_span))
  }

  // Anchor tiles to the subgrid with nested groups collapsed.
  const expandingChildren = [...childSubgrids.keys()]
  const anchors = new Map<string, Anchor>()
  if (expandingChildren.length > 0) {
    const baseline = layoutGroup(
      group,
      groups,
      new Set(
        [...expandedGroups].filter((key) => !expandingChildren.includes(key)),
      ),
      collapsed,
      ancestors,
    )
    if (baseline.subgrid.success) {
      for (const tile of baseline.subgrid.tiles) {
        if ("key" in tile) {
          anchors.set(`${tile.type}:${tile.key}`, {
            row: tile.location.row_start,
            col: tile.location.col_start,
          })
        }
      }
    }
  }
  const priority_list_of_tiles = prioritize(
    members,
    anchors,
    new Set(expandingChildren.map((key) => `group:${key}`)),
  )

  let extraRows = 0
  let extraCols = 0
  let lastError = `Could not fit the members of group "${group.key}"`
  for (let attempt = 0; attempt < MAX_GROUP_ATTEMPTS; attempt++) {
    const result = attemptLayout({
      priority_list_of_tiles,
      rows,
      cols,
      default_tile: null,
    })
    if (result.success) {
      return {
        row_span,
        col_span,
        subgrid: {
          success: true,
          rows,
          cols,
          tiles: result.tiles.map((tile) =>
            tile.type === "group" && childSubgrids.has(tile.key)
              ? { ...tile, subgrid: childSubgrids.get(tile.key) }
              : tile,
          ),
        },
      }
    }
    lastError = result.error

    if (derivedOnly) {
      if (fixedRows && fixedCols) break
      if (!fixedRows) rows++
      else cols++
      continue
    }

    // Grow the group (one subgrid cell per parent cell) while its bounds
    // allow, then pack more cells into it.
    const growCol = col_span < colBounds.hi
    const growRow = row_span < rowBounds.hi
    if (growCol && (col_span <= row_span || !growRow)) col_span++
    else if (growRow) row_span++
    else if (extraRows * col_span <= extraCols * row_span) extraRows++
    else extraCols++
    rows = Math.max(rows, row_span + extraRows)
    cols = Math.max(cols, col_span + extraCols)
  }
  return {
    row_span,
    col_span,
    subgrid: { success: false, error: lastError },
  }
}

export function generateTiles(
  config: PublicConfig,
  clientWidth: number,
  clientHeight: number,
  expandedGroups: ReadonlySet<string> = new Set(),
):
  | {
      success: true
      tiles: Array<GeneratedTile>
      layout: { rows: number; cols: number }
    }
  | { success: false; error: string } {
  // 1-indexing throughout this function.
  function WHratio(rows: number, cols: number): number {
    return clientWidth / cols / (clientHeight / rows)
  }

  function HWratio(rows: number, cols: number): number {
    return clientHeight / rows / (clientWidth / cols)
  }

  // Expanded groups take their expanded span on the main grid; their
  // subgrid does not depend on the main grid, so it is laid out once.
  const subgrids = new Map<string, Subgrid>()
  const tiles = config.tiles.map((tile): PublicTile => {
    if (tile.type !== "group" || !expandedGroups.has(tile.key)) return tile
    const { row_span, col_span, subgrid } = layoutGroup(
      tile,
      config.groups,
      expandedGroups,
    )
    subgrids.set(tile.key, subgrid)
    return { ...tile, row_span, col_span }
  })

  // Expanding happens in place: each expanded group grows from where it sits
  // on the collapsed board, and every other tile keeps its collapsed cell
  // unless an expanded group now covers it, in which case it moves to the
  // nearest free cell.
  const anchors = new Map<string, Anchor>()
  if (subgrids.size > 0) {
    const collapsed = generateTiles(config, clientWidth, clientHeight)
    if (collapsed.success) {
      for (const tile of collapsed.tiles) {
        const id = "key" in tile ? `${tile.type}:${tile.key}` : undefined
        if (id !== undefined) {
          anchors.set(id, {
            row: tile.location.row_start,
            col: tile.location.col_start,
          })
        }
      }
    }
  }

  const priority_list_of_tiles = prioritize(
    tiles,
    anchors,
    new Set([...subgrids.keys()].map((key) => `group:${key}`)),
  )

  let rows = 0
  let cols = 0

  let placed_tiles: Array<GeneratedTile> | undefined = undefined

  while (rows < 20 && cols < 20) {
    rows++
    cols++
    if (WHratio(rows, cols) > MAX_RATIO) {
      cols++
    }
    if (HWratio(rows, cols) > MAX_RATIO) {
      rows++
    }

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

  rows++
  cols++

  while (true) {
    if (
      WHratio(rows - 1, cols) <= MAX_RATIO &&
      HWratio(rows - 1, cols) <= MAX_RATIO
    ) {
      const attempt = attemptLayout({
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
    }
    if (
      WHratio(rows, cols - 1) <= MAX_RATIO &&
      HWratio(rows, cols - 1) <= MAX_RATIO
    ) {
      const attempt = attemptLayout({
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
    }

    break
  }

  return {
    success: true,
    tiles: placed_tiles.map((tile) =>
      tile.type === "group" && subgrids.has(tile.key)
        ? { ...tile, subgrid: subgrids.get(tile.key) }
        : tile,
    ),
    layout: { rows: rows, cols: cols },
  }
}
