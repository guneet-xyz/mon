import { ServerOnly } from "@/components/server-only"
import type { GeneratedTile } from "@/lib/client/tile-generation"

import { ContainerTile } from "./container"
import { EmptyTile } from "./empty"
import { HiddenTile } from "./hidden"
import { HostTile } from "./host"
import { WebsiteTile } from "./website"

import Link from "next/link"

export function Tile({ tile }: { tile: GeneratedTile }) {
  if (tile.type === "container") {
    return (
      <Container {...tile.location}>
        <Link href={`/monitor/${tile.key}`}>
          <ServerOnly>
            <ContainerTile
              dbKey={tile.key}
              r_span={tile.location.row_span}
              c_span={tile.location.col_span}
            />
          </ServerOnly>
        </Link>
      </Container>
    )
  }

  if (tile.type === "host") {
    return (
      <Container {...tile.location}>
        <Link href={`/monitor/${tile.key}`}>
          <ServerOnly>
            <HostTile
              dbKey={tile.key}
              r_span={tile.location.row_span}
              c_span={tile.location.col_span}
            />
          </ServerOnly>
        </Link>
      </Container>
    )
  }

  if (tile.type === "website") {
    return (
      <Container {...tile.location}>
        <Link href={`/monitor/${tile.key}`}>
          <ServerOnly>
            <WebsiteTile
              dbKey={tile.key}
              r_span={tile.location.row_span}
              c_span={tile.location.col_span}
            />
          </ServerOnly>
        </Link>
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

export function Container({
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
      className="m-1"
      style={{
        gridColumnStart: col_start,
        gridColumnEnd: col_start + col_span,
        gridRowStart: row_start,
        gridRowEnd: row_start + row_span,
      }}
    >
      {children}
    </div>
  )
}
