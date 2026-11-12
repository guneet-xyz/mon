"use client"

import type { PublicConfig } from "@mon/config/schema"

import { Tile } from "@/components/tiles"
import useWindowDimensions from "@/lib/client/hooks/dimensions"
import { useExpandedGroups } from "@/lib/client/hooks/expanded-groups"
import { generateTiles } from "@/lib/client/tile-generation"

export function TileGrid({ config }: { config: PublicConfig }) {
  const { width, height } = useWindowDimensions()
  const { expanded, toggle } = useExpandedGroups()
  const data = generateTiles(config, width, height, expanded)
  if (!data.success) {
    return <div>Error: {data.error}</div>
  }

  const { tiles } = data

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-4">
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${data.layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${data.layout.rows}, 1fr)`,
        }}
      >
        {tiles.map((tile, index) => (
          <Tile key={index} tile={tile} onToggleGroup={toggle} />
        ))}
      </div>
    </div>
  )
}
