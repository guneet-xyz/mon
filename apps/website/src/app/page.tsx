import { Tile } from "@/components/tiles"
import { generateTiles } from "@/lib/server/tile-generation"

import { getConfig } from "@mon/config"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const config = await getConfig()

  const data = generateTiles(config)
  if (!data.success) {
    return <div>Error: {data.error}</div>
  }

  const { tiles } = data

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-4">
      <div
        className="grid h-fit w-fit"
        style={{
          gridTemplateColumns: `repeat(${data.layout.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${data.layout.rows}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((tile, index) => (
          <Tile key={index} tile={tile} />
        ))}
      </div>
    </div>
  )
}
