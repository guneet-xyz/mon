import { getPings } from "@/lib/server/monitors"

import { LatencyChartClientSide } from "./client"

import type { MonitorTile } from "@mon/config/schema"

export async function LatencyChart({ monitor }: { monitor: MonitorTile }) {
  const pings = await getPings(monitor.type, monitor.key)
  if (!pings) return <div>This monitor does not support latency chart</div>
  return <LatencyChartClientSide pings={pings} />
}
