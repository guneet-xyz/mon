"use client"

import { Tile } from "@/components/tiles"
import useWindowDimensions from "@/lib/client/hooks/dimensions"
import { generateTiles } from "@/lib/client/tile-generation"

import type { Config } from "@mon/config/schema"

export function TileGrid({ config }: { config: Config }) {
  const { width, height } = useWindowDimensions()
  const data = generateTiles(config, width, height)
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
          <Tile key={index} tile={tile} />
        ))}
      </div>
    </div>
  )
}
