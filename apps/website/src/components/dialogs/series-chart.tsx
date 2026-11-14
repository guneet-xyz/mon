"use client"

import dayjs from "dayjs"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { HistoryRange, SeriesPoint } from "@/lib/server/monitors/history"

export type ChartLine = {
  // Recharts data key: letters, digits and dashes only.
  key: string
  label: string
  color: string
  value: (point: SeriesPoint) => number | null
}

// Downsampled series from a monitor's history: one line (latency, CPU) or
// several (a machine's disks).
export function SeriesChart({
  points,
  lines,
  label,
  range,
  format,
}: {
  points: SeriesPoint[]
  lines: ChartLine[]
  label: string
  range: HistoryRange
  format: (value: number) => string | null
}) {
  const data = points
    .map((point) => ({
      timestamp: point.timestamp,
      ...Object.fromEntries(lines.map((line) => [line.key, line.value(point)])),
    }))
    .filter((row) =>
      lines.some((line) => (row as Record<string, unknown>)[line.key] !== null),
    )
  if (data.length === 0) {
    return (
      <div className="p-4 font-display text-neutral-500">
        No {label.toLowerCase()} recorded in this range.
      </div>
    )
  }

  const config: ChartConfig = Object.fromEntries(
    lines.map((line) => [line.key, { label: line.label, color: line.color }]),
  )

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[200px] w-full sm:min-w-96"
    >
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          {lines.map((line) => (
            <linearGradient
              key={line.key}
              id={`fill-${line.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={line.color} stopOpacity={0.5} />
              <stop offset="95%" stopColor={line.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: Date) =>
            dayjs(value).format(range === "24h" ? "HH:mm" : "MMM D")
          }
        />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => format(value) ?? ""}
          domain={[0, "auto"]}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(_, payload) => {
                const point = payload[0]?.payload as
                  { timestamp?: unknown } | undefined
                const timestamp = point?.timestamp
                return timestamp instanceof Date
                  ? dayjs(timestamp).format("YYYY-MM-DD HH:mm")
                  : ""
              }}
              // Called as (value, name, ...); the declared type omits name.
              formatter={(value: unknown, ...rest: unknown[]) => {
                const formatted =
                  typeof value === "number" ? (format(value) ?? "") : "N/A"
                const name = rest[0]
                const label =
                  typeof name === "string" ? config[name]?.label : undefined
                return lines.length > 1 && typeof label === "string"
                  ? `${label}: ${formatted}`
                  : formatted
              }}
            />
          }
        />
        {lines.map((line) => (
          <Area
            key={line.key}
            isAnimationActive={false}
            dataKey={line.key}
            name={line.key}
            type="monotone"
            fill={`url(#fill-${line.key})`}
            stroke={line.color}
            connectNulls
          />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}
