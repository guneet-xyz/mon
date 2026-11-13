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

// One downsampled series from a monitor's history, e.g. latency or CPU.
export function SeriesChart({
  points,
  dataKey,
  label,
  color,
  range,
  format,
}: {
  points: SeriesPoint[]
  dataKey: "latency" | "cpu" | "memory"
  label: string
  color: string
  range: HistoryRange
  format: (value: number) => string | null
}) {
  const data = points.filter((point) => point[dataKey] !== null)
  if (data.length === 0) {
    return (
      <div className="p-4 font-display text-neutral-500">
        No {label.toLowerCase()} recorded in this range.
      </div>
    )
  }

  const config: ChartConfig = { [dataKey]: { label, color } }
  const fill = `fill-${dataKey}`

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-[200px] w-full sm:min-w-96"
    >
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.6} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
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
              formatter={(value) =>
                typeof value === "number" ? (format(value) ?? "") : "N/A"
              }
            />
          }
        />
        <Area
          isAnimationActive={false}
          dataKey={dataKey}
          type="monotone"
          fill={`url(#${fill})`}
          stroke={color}
        />
      </AreaChart>
    </ChartContainer>
  )
}
