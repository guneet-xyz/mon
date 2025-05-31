"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

import dayjs from "dayjs"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

export function HostLatencyChart({
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
      className="aspect-auto h-[250px] w-full"
    >
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-desktop)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-desktop)"
              stopOpacity={0.1}
            />
          </linearGradient>
          <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-mobile)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-mobile)"
              stopOpacity={0.1}
            />
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
            // console.log("value", value, ret)
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
          dataKey="latency"
          type="natural"
          fill="url(#fillMobile)"
          stroke="var(--color-mobile)"
          stackId="a"
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
