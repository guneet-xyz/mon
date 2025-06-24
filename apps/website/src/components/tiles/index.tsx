import type { GeneratedTile } from "@/lib/client/tile-generation"

import { ContainerTile } from "./container"
import { EmptyTile } from "./empty"
import { GithubTile } from "./github"
import { HiddenTile } from "./hidden"
import { HostTile } from "./host"
import { LogoTile } from "./logo"
import { ThemeTile } from "./theme"
import { WebsiteTile } from "./website"

export function Tile({ tile }: { tile: GeneratedTile }) {
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

  if (tile.type === "github") {
    return (
      <Container {...tile.location}>
        <GithubTile
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

  if (tile.type === "hidden")
    return (
      <Container {...tile.location}>
        <HiddenTile />
      </Container>
    )

  if (tile.type === "logo") {
    return (
      <Container {...tile.location}>
        <LogoTile
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "theme") {
    return (
      <Container {...tile.location}>
        <ThemeTile />
      </Container>
    )
  }

  throw new Error(`How did we get here?`)
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
