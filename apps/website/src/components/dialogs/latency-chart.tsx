"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { getPings } from "@/lib/server/actions/get-pings"

import type { MonitorTile } from "@mon/config/schema"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

export function LatencyChart({
  type,
  dbKey,
}: {
  type: MonitorTile["type"]
  dbKey: string
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["pings", type, dbKey],
    queryFn: async () => await getPings(type, dbKey),
  })

  if (isLoading) {
    return <div className="p-4 font-display text-neutral-500">Loading...</div>
  }

  if (isError) {
    throw new Error("Failed to load pings data")
  }

  if (!data) return <div>This monitor does not support latency chart</div>

  const pings = data

  return <LatencyChartClientSide pings={pings} />
}

export function LatencyChartClientSide({
  pings,
}: {
  pings: { timestamp: Date; latency: number }[]
}) {
  const chartData = pings

  const chartConfig: ChartConfig = {
    latency: {
      label: "Latency",
      color: "#2563eb",
    },
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[250px] w-full sm:min-w-96"
    >
      <AreaChart
        data={chartData}
        className="h-full w-full"
        margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="green" stopOpacity={0.8} />
            <stop offset="95%" stopColor="green" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: Date) => {
            const ret = dayjs(value).format("hh:mm")
            return ret
          }}
        />
        <YAxis
          type="number"
          domain={[
            "dataMin",
            (dataMax: number) => {
              if (dataMax < 1) return 1
              if (dataMax < 100) return 100
              if (dataMax < 1000) return 1000
              return dataMax * 1.1
            },
          ]}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value) => {
                if (typeof value !== "number") return "N/A"
                return `${value} ms`
              }}
            />
          }
        />
        <Area
          isAnimationActive={false}
          dataKey="latency"
          type="natural"
          fill="url(#fill)"
          stroke="#4ade80"
          stackId="a"
          label={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
