"use client"

import { useRef } from "react"

import type { PublicConfig } from "@mon/config/schema"

import { Tile } from "@/components/tiles"
import useWindowDimensions from "@/lib/client/hooks/dimensions"
import { useExpandedGroups } from "@/lib/client/hooks/expanded-groups"
import { useFlipAnimation } from "@/lib/client/hooks/flip"
import {
  generateTiles,
  tileId,
  trimFillers,
} from "@/lib/client/tile-generation"

const NON_MONITORS = ["empty", "hidden", "logo", "theme"]

export function TileGrid({ config }: { config: PublicConfig }) {
  const { width, height } = useWindowDimensions()
  const { expanded, toggle } = useExpandedGroups(config.groups)
  const gridRef = useRef<HTMLDivElement>(null)
  useFlipAnimation(gridRef, [...expanded].sort().join("\n"))
  const data = generateTiles(config, width, height, expanded)
  if (!data.success) {
    return <div>Error: {data.error}</div>
  }

  const { tiles, rows } = trimFillers(data.tiles, data.layout.rows)

  const empty = config.tiles.every((tile) => NON_MONITORS.includes(tile.type))

  return (
    <div className="flex h-screen w-full flex-col items-center p-4">
      <div
        ref={gridRef}
        className="grid w-full"
        style={{
          // Trimmed rows keep the size they had on the full board. Without
          // monitors, the logo and theme toggle get one short row.
          height: empty ? "6rem" : `${(rows / data.layout.rows) * 100}%`,
          gridTemplateColumns: `repeat(${data.layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile) => (
          <Tile
            key={tileId(tile)}
            flipId={tileId(tile)}
            tile={tile}
            onToggleGroup={toggle}
          />
        ))}
      </div>
      {empty ? (
        <div className="flex grow items-center justify-center">
          <div className="max-w-sm rounded-xl border-2 border-emerald-700 bg-emerald-100 p-6 text-center text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
            <h1 className="font-display text-2xl">Nothing to show yet</h1>
            <p className="mt-2 text-sm">
              This board has no monitors yet. Add tiles to its config file, then
              reload this page.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
