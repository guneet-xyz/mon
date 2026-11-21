"use client"

import { useQuery } from "@tanstack/react-query"
import { CircleHelp, CircleX, Minimize2, TriangleAlert } from "lucide-react"

import { StatusDot } from "@/components/status-dot"
import type { Subgrid } from "@/lib/client/tile-generation"
import { getGroupTileInfo } from "@/lib/server/actions/get-group-tile-info"
import { groupMessage, upCount, type Tone } from "@/lib/tile-state"
import { cn } from "@/lib/utils"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

function useGroupInfo(dbKey: string) {
  return useQuery({
    queryKey: ["group-config", dbKey],
    queryFn: async () => await getGroupTileInfo(dbKey),
  })
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
  const { data, isFetched } = useGroupInfo(dbKey)
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status, tone, summary, members } = data

  const name = config.name ?? config.key
  const message = groupMessage(summary)

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }

  return (
    <BaseTile
      r_span={r_span}
      c_span={c_span}
      title={name}
      short_title={config.short_name}
      // The problem is the headline; the count is still there for context.
      top_text={tone === "ok" ? undefined : upCount(summary)}
      bottom_text={message}
      large_bottom
      tone={tone}
      status={status}
      orientation={orientation}
      icon={config.icon}
      top_right_icon="mdi:view-grid-outline"
      statusLine={members.map((member) => member.tone)}
      label={`Expand ${name}`}
      onClick={onExpand}
    />
  )
}

const HEADER_TONE: Record<Tone, string> = {
  ok: "text-emerald-800 dark:text-emerald-200",
  warning: "text-amber-800 dark:text-amber-300",
  down: "text-rose-800 dark:text-rose-300",
  unknown: "text-stone-700 dark:text-stone-300",
}

const HEADER_ICON = {
  warning: TriangleAlert,
  down: CircleX,
  unknown: CircleHelp,
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
  const { data } = useGroupInfo(dbKey)
  // Blank until loaded rather than the raw key.
  const name = data ? (data.config.name ?? data.config.key) : ""
  const Icon = data && data.tone !== "ok" ? HEADER_ICON[data.tone] : null

  return (
    <div
      data-testid="expanded-group"
      className={cn(
        "@container flex h-full w-full flex-col overflow-hidden rounded-xl",
        "border-2 border-dashed border-emerald-700 dark:border-emerald-900",
        "bg-emerald-100/40 dark:bg-emerald-950/30",
      )}
    >
      <button
        type="button"
        aria-label={`Collapse ${name || dbKey}`}
        onClick={onCollapse}
        className="flex shrink-0 cursor-pointer flex-wrap items-center gap-x-2 px-3 py-1 text-left font-display text-sm text-emerald-900 transition-colors outline-none hover:bg-emerald-300/40 focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-inset @min-[20rem]:text-base dark:text-emerald-100 dark:hover:bg-emerald-900/40 dark:focus-visible:ring-sky-400"
      >
        {/* On narrow groups the counts wrap under the name. */}
        <span className="flex min-w-0 items-center gap-2">
          {data ? (
            <StatusDot
              status={data.status}
              warning={data.tone === "warning"}
              className="shrink-0"
            />
          ) : null}
          <span className="truncate">{name}</span>
        </span>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {data ? (
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 font-semibold",
                HEADER_TONE[data.tone],
              )}
            >
              {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
              <span className="truncate">
                {data.tone === "ok" ? (
                  upCount(data.summary)
                ) : (
                  <>
                    {groupMessage(data.summary)}
                    {/* The count is context; narrow groups leave it out. */}
                    <span className="hidden @min-[26rem]:inline">
                      {` · ${upCount(data.summary)}`}
                    </span>
                  </>
                )}
              </span>
            </span>
          ) : null}
          <Minimize2 className="size-4 shrink-0" />
        </span>
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
