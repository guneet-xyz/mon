"use client"

import { StatusDot } from "@/components/status-dot"
import type { Subgrid } from "@/lib/client/tile-generation"
import { getGroupTileInfo } from "@/lib/server/actions/get-group-tile-info"
import { cn } from "@/lib/utils"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

import { useQuery } from "@tanstack/react-query"
import { Minimize2 } from "lucide-react"

function useGroupInfo(dbKey: string) {
  const { data, isFetched } = useQuery({
    queryKey: ["group-config", dbKey],
    queryFn: async () => await getGroupTileInfo(dbKey),
  })
  const statuses = data?.members.map((member) => member.status) ?? []
  const up = statuses.filter((status) => status === "online").length
  return { data, isFetched, statuses, up }
}

export function GroupTile({
  dbKey,
  r_span,
  c_span,
  onExpand,
}: {
  dbKey: string
  r_span: number
  c_span: number
  onExpand: () => void
}) {
  const { data, isFetched, statuses, up } = useGroupInfo(dbKey)
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status, members } = data

  let title: string
  const name = config.name ?? config.key

  if (config.short_name) {
    title = config.short_name
  } else if (r_span === 1 && c_span === 1) {
    title = name.length > 3 ? name[0]!.toUpperCase() : name
  } else {
    title = name
  }

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }

  return (
    <BaseTile
      r_span={r_span}
      c_span={c_span}
      title={title}
      top_text={`${up}/${members.length} up`}
      status={status}
      orientation={orientation}
      icon={config.icon}
      top_right_icon="mdi:view-grid-outline"
      statusLine={statuses}
      label={`Expand ${name}`}
      onClick={onExpand}
    />
  )
}

export function ExpandedGroupTile({
  dbKey,
  subgrid,
  onCollapse,
  children,
}: {
  dbKey: string
  subgrid: Subgrid
  onCollapse: () => void
  children: React.ReactNode
}) {
  const { data, statuses, up } = useGroupInfo(dbKey)
  const name = data?.config.name ?? dbKey

  return (
    <div
      data-testid="expanded-group"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl",
        "border-2 border-dashed border-emerald-700 dark:border-emerald-900",
        "bg-emerald-100/40 dark:bg-emerald-950/30",
      )}
    >
      <button
        type="button"
        aria-label={`Collapse ${name}`}
        onClick={onCollapse}
        className="flex shrink-0 cursor-pointer items-center gap-2 px-3 py-1 text-left font-display text-emerald-900 transition-colors hover:bg-emerald-300/40 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
      >
        {data ? <StatusDot status={data.status} className="shrink-0" /> : null}
        <span className="truncate">{name}</span>
        <span className="ml-auto shrink-0 text-xs text-emerald-700 dark:text-emerald-500">
          {data ? `${up}/${statuses.length} up` : null}
        </span>
        <Minimize2 className="size-4 shrink-0" />
      </button>
      {subgrid.success ? (
        <div
          className="grid min-h-0 grow"
          style={{
            gridTemplateColumns: `repeat(${subgrid.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${subgrid.rows}, minmax(0, 1fr))`,
          }}
        >
          {children}
        </div>
      ) : (
        <div className="p-2 text-sm text-rose-700 dark:text-rose-400">
          {subgrid.error}
        </div>
      )}
    </div>
  )
}
