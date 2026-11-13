"use client"

import { useRef } from "react"

import type { PublicConfig } from "@mon/config/schema"

import { Tile } from "@/components/tiles"
import useWindowDimensions from "@/lib/client/hooks/dimensions"
import { useExpandedGroups } from "@/lib/client/hooks/expanded-groups"
import { useFlipAnimation } from "@/lib/client/hooks/flip"
import { generateTiles, tileId } from "@/lib/client/tile-generation"

export function TileGrid({ config }: { config: PublicConfig }) {
  const { width, height } = useWindowDimensions()
  const { expanded, toggle } = useExpandedGroups(config.groups)
  const gridRef = useRef<HTMLDivElement>(null)
  useFlipAnimation(gridRef, [...expanded].sort().join("\n"))
  const data = generateTiles(config, width, height, expanded)
  if (!data.success) {
    return <div>Error: {data.error}</div>
  }

  const { tiles } = data

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-4">
      <div
        ref={gridRef}
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${data.layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${data.layout.rows}, minmax(0, 1fr))`,
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
    </div>
  )
}
