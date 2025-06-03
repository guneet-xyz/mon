import type { Tile } from "@/lib/server/tile-generation"

import { ContainerTile } from "./container"
import { EmptyTile } from "./empty"
import { HostTile } from "./host"
import { WebsiteTile } from "./website"

export function Tile({ tile }: { tile: Tile }) {
  if (tile.type === "container") {
    return (
      <Container {...tile.location}>
        <ContainerTile key={tile.key} />
      </Container>
    )
  }

  if (tile.type === "host") {
    return (
      <Container {...tile.location}>
        <HostTile key={tile.key} />
      </Container>
    )
  }

  if (tile.type === "website") {
    return (
      <Container {...tile.location}>
        <WebsiteTile key={tile.key} />
      </Container>
    )
  }

  return (
    <Container {...tile.location}>
      <EmptyTile />
    </Container>
  )
}
function Container({
  children,
  row_start,
  row_span,
  col_start,
  col_span,
}: {
  children: React.ReactNode
  row_start: number
  row_span: number
  col_start: number
  col_span: number
}) {
  return (
    <div
      className="m-2 max-h-96 min-h-20 max-w-96 min-w-20"
      style={{
        gridColumnStart: col_start + 1,
        gridColumnEnd: col_start + col_span + 1,
        gridRowStart: row_start + 1,
        gridRowEnd: row_start + row_span + 1,
      }}
    >
      {children}
    </div>
  )
}
