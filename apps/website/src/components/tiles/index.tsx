import type { GeneratedTile } from "@/lib/client/tile-generation"
import { cn } from "@/lib/utils"

import { ContainerTile } from "./container"
import { EmptyTile } from "./empty"
import { GithubTile } from "./github"
import { ExpandedGroupTile, GroupTile } from "./group"
import { HiddenTile } from "./hidden"
import { HostTile } from "./host"
import { LogoTile } from "./logo"
import { ThemeTile } from "./theme"
import { WebsiteTile } from "./website"

export function Tile({
  tile,
  onToggleGroup,
  flipId,
  enterDelay,
}: {
  tile: GeneratedTile
  onToggleGroup?: (key: string) => void
  flipId?: string // set on main-grid tiles for the expand/collapse animation
  enterDelay?: number // position in a staggered entrance (group members)
}) {
  if (tile.type === "container") {
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
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
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
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
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
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
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
        <GithubTile
          dbKey={tile.key}
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "group") {
    const toggle = () => onToggleGroup?.(tile.key)
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
        {tile.subgrid ? (
          <ExpandedGroupTile
            dbKey={tile.key}
            subgrid={tile.subgrid}
            onCollapse={toggle}
          >
            {tile.subgrid.success
              ? tile.subgrid.tiles.map((member, index) => (
                  <Tile key={index} tile={member} enterDelay={index} />
                ))
              : null}
          </ExpandedGroupTile>
        ) : (
          <GroupTile
            dbKey={tile.key}
            r_span={tile.location.row_span}
            c_span={tile.location.col_span}
            onExpand={toggle}
          />
        )}
      </Container>
    )
  }

  if (tile.type === "empty") {
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
        <EmptyTile />
      </Container>
    )
  }

  if (tile.type === "hidden")
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
        <HiddenTile />
      </Container>
    )

  if (tile.type === "logo") {
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
        <LogoTile
          r_span={tile.location.row_span}
          c_span={tile.location.col_span}
        />
      </Container>
    )
  }

  if (tile.type === "theme") {
    return (
      <Container {...tile.location} flipId={flipId} enterDelay={enterDelay}>
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
  flipId,
  enterDelay,
}: {
  children: React.ReactNode
  row_start: number
  row_span: number
  col_start: number
  col_span: number
  flipId?: string
  enterDelay?: number
}) {
  return (
    <div
      data-flip-id={flipId}
      className={cn(
        "m-1",
        enterDelay !== undefined &&
          "animate-in duration-300 fill-mode-both zoom-in-90 fade-in motion-reduce:animate-none",
      )}
      style={{
        ...(enterDelay !== undefined && {
          "--tw-animation-delay": `${120 + enterDelay * 40}ms`,
        }),
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
