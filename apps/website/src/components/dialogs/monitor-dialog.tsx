"use client"

import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { CircleHelp, CircleX, TriangleAlert } from "lucide-react"
import { useState } from "react"

import type { MonitorTile, PublicTile } from "@mon/config/schema"

import { Incidents } from "@/components/dialogs/incidents"
import { MonitorLink } from "@/components/dialogs/monitor-link"
import { SeriesChart, type ChartLine } from "@/components/dialogs/series-chart"
import { StatusDot } from "@/components/status-dot"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatBytes, formatLatency, formatPercent } from "@/lib/client/format"
import { monitorState } from "@/lib/client/monitor-state"
import { monitorSummary, uptimeStats } from "@/lib/client/monitor-summary"
import { getMonitorHistory } from "@/lib/server/actions/get-monitor-history"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"
import type { HistoryRange, SeriesPoint } from "@/lib/server/monitors/history"
import { cn } from "@/lib/utils"

// "14:05" today, "20 Nov 14:05" before.
function formatWhen(date: Date, now: Date = new Date()): string {
  return dayjs(date).format(
    dayjs(date).isSame(now, "day") ? "HH:mm" : "D MMM HH:mm",
  )
}

const RANGES: Array<{ value: HistoryRange; label: string }> = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
]

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      {children}
    </section>
  )
}

// Cards in the dialog: solid and light on white, dashed on dark.
const CARD =
  "rounded-xl border border-neutral-200 bg-neutral-50 dark:border-dashed dark:border-neutral-500/50 dark:bg-neutral-900/30"

const TYPE_LABEL: Record<MonitorTile["type"], string> = {
  host: "Host",
  website: "Website",
  container: "Container",
  agent: "Machine",
  github: "GitHub repository",
}

// What the monitor watches, in words. Websites and repositories also get a
// link (MonitorLink) under it.
function subtitle(config: PublicTile | undefined, type: MonitorTile["type"]) {
  if (config?.type === "host") return `${TYPE_LABEL[type]} · ${config.address}`
  if (config?.type === "container")
    return `${TYPE_LABEL[type]} · ${config.container_name}`
  return TYPE_LABEL[type]
}

function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: string; detail?: string }>
}) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className={cn("min-w-0 px-3 py-2", CARD)}>
          <dt className="text-xs text-neutral-600 dark:text-neutral-400">
            {stat.label}
          </dt>
          <dd className="truncate font-display" title={stat.value}>
            {stat.value}
          </dd>
          {stat.detail ? (
            <dd
              className="truncate text-xs text-neutral-600 dark:text-neutral-400"
              title={stat.detail}
            >
              {stat.detail}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

const CPU_LINE: ChartLine = {
  key: "cpu",
  label: "CPU",
  color: "#0ea5e9",
  value: (p) => p.cpu,
}
const MEMORY_LINE: ChartLine = {
  key: "memory",
  label: "Memory",
  color: "#a855f7",
  value: (p) => p.memory,
}
const DISK_COLORS = ["#f59e0b", "#14b8a6", "#ec4899", "#6366f1", "#84cc16"]

// One line per disk the machine reported in this range.
function diskLines(series: SeriesPoint[]): ChartLine[] {
  const names = [
    ...new Set(series.flatMap((point) => Object.keys(point.disks ?? {}))),
  ].sort()
  return names.map((name, index) => ({
    key: `disk-${index}`,
    label: name,
    color: DISK_COLORS[index % DISK_COLORS.length]!,
    value: (p) => p.disks?.[name] ?? null,
  }))
}

const panel = cn(
  "p-4 text-neutral-600 dark:text-neutral-500",
  "rounded-xl border border-neutral-200 bg-neutral-50 dark:border-dashed dark:border-neutral-500/50 dark:bg-neutral-900/30",
)

export function MonitorDialog({
  type,
  dbKey,
  children,
}: {
  type: MonitorTile["type"]
  dbKey: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<HistoryRange>("24h")

  // Shares the tile's query, so opening the dialog needs no extra request.
  const { data: info } = useQuery({
    queryKey: ["monitor-config", type, dbKey],
    queryFn: async () => await getMonitorTileInfo(type, dbKey),
  })
  const { data: history, isLoading } = useQuery({
    queryKey: ["monitor-history", type, dbKey, range],
    queryFn: async () => await getMonitorHistory(type, dbKey, range),
    enabled: open,
  })

  const config = info?.config
  const summary = monitorSummary(info?.details)
  const warnings = info?.warnings ?? []
  const series = history?.series ?? null
  const state = info ? monitorState(info, type) : null
  // Old values are labelled as such, not shown as current.
  const nowTitle =
    info?.stale && info.lastCheck
      ? `${type === "agent" ? "Last reported" : "Last checked"} ${formatWhen(info.lastCheck.timestamp)}`
      : "Now"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] w-full !max-w-none overflow-y-auto p-4 sm:w-auto sm:max-w-3xl sm:min-w-[36rem] sm:p-8">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {info ? (
              <StatusDot status={info.status} warning={warnings.length > 0} />
            ) : null}
            {config?.name ?? dbKey}
          </DialogTitle>
          <DialogDescription>{subtitle(config, type)}</DialogDescription>
        </DialogHeader>
        <MonitorLink config={config} />

        {state && (state.tone === "down" || state.tone === "unknown") ? (
          <div
            data-testid="monitor-problem"
            className={cn(
              "mt-2 flex items-center gap-2 rounded-xl border p-3 text-sm font-medium",
              state.tone === "down"
                ? "border-rose-600/50 bg-rose-500/10 text-rose-800 dark:text-rose-300"
                : "border-stone-500/50 bg-stone-500/10 text-stone-700 dark:text-stone-300",
            )}
          >
            {state.tone === "down" ? (
              <CircleX className="size-4 shrink-0" />
            ) : (
              <CircleHelp className="size-4 shrink-0" />
            )}
            {state.message}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <ul
            data-testid="monitor-warnings"
            className="mt-2 rounded-xl border border-amber-600/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
          >
            {warnings.map((warning) => (
              <li key={warning} className="flex items-center gap-2">
                <TriangleAlert className="size-4 shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        ) : null}

        {summary.length > 0 ? (
          <Section title={nowTitle}>
            <StatGrid stats={summary} />
          </Section>
        ) : null}

        <Section title="Uptime">
          <StatGrid stats={uptimeStats(history?.uptime, history?.firstCheck)} />
        </Section>

        <div
          role="group"
          aria-label="History range"
          className="mt-4 flex gap-2"
        >
          {RANGES.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={value === range ? "default" : "outline"}
              aria-pressed={value === range}
              onClick={() => setRange(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="mt-4 p-4 font-display text-neutral-500">
            Loading...
          </div>
        ) : null}

        {series && (type === "host" || type === "website") ? (
          <Section title="Latency">
            <div className={panel}>
              <SeriesChart
                points={series}
                lines={[
                  {
                    key: "latency",
                    label: "Latency",
                    color: "#22c55e",
                    value: (p) => p.latency,
                  },
                ]}
                label="Latency"
                range={range}
                format={formatLatency}
              />
            </div>
          </Section>
        ) : null}

        {series && type === "container" ? (
          <>
            <Section title="CPU">
              <div className={panel}>
                <SeriesChart
                  points={series}
                  lines={[CPU_LINE]}
                  label="CPU"
                  range={range}
                  format={formatPercent}
                />
              </div>
            </Section>
            <Section title="Memory">
              <div className={panel}>
                <SeriesChart
                  points={series}
                  lines={[MEMORY_LINE]}
                  label="Memory"
                  range={range}
                  format={formatBytes}
                />
              </div>
            </Section>
          </>
        ) : null}

        {series && type === "agent" ? (
          <>
            <Section title="CPU">
              <div className={panel}>
                <SeriesChart
                  points={series}
                  lines={[CPU_LINE]}
                  label="CPU"
                  range={range}
                  format={formatPercent}
                />
              </div>
            </Section>
            <Section title="Memory">
              <div className={panel}>
                <SeriesChart
                  points={series}
                  lines={[MEMORY_LINE]}
                  label="Memory"
                  range={range}
                  format={formatBytes}
                />
              </div>
            </Section>
            <Section title="Disks">
              <div className={panel}>
                <SeriesChart
                  points={series}
                  lines={diskLines(series)}
                  label="Disk usage"
                  range={range}
                  format={formatPercent}
                />
              </div>
            </Section>
          </>
        ) : null}

        {history ? (
          <Section title="Incidents">
            <div className={`max-h-64 overflow-y-auto ${panel}`}>
              <Incidents incidents={history.incidents} range={range} />
            </div>
          </Section>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
