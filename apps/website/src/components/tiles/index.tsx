import type { Tile } from "@/lib/server/tile-generation"

import { ContainerTile } from "./container"
import { EmptyTile } from "./empty"
import { HiddenTile } from "./hidden"
import { HostTile } from "./host"
import { WebsiteTile } from "./website"

export function Tile({ tile }: { tile: Tile }) {
  if (tile.type === "container") {
    return (
      <Container {...tile.location}>
        <ContainerTile
          dbKey={tile.key}
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "host") {
    return (
      <Container {...tile.location}>
        <HostTile
          dbKey={tile.key}
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "website") {
    return (
      <Container {...tile.location}>
        <WebsiteTile
          dbKey={tile.key}
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "empty") {
    return (
      <Container {...tile.location}>
        <EmptyTile />
      </Container>
    )
  }

  return (
    <Container {...tile.location}>
      <HiddenTile />
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
      className="m-1 max-h-96 min-h-20 max-w-96 min-w-20"
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
