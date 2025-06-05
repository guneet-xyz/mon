import { LatencyChart } from "./_components/latency-chart"

import { getMonitors } from "@mon/config"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const monitors = await getMonitors()
  const monitor = monitors.find(
    (tile) =>
      (tile.type === "host" ||
        tile.type === "container" ||
        tile.type === "website") &&
      tile.key === slug,
  )

  if (!monitor) {
    notFound()
  }

  return (
    <div className="">
      <div className="mb-8 ml-4">
        <div className="font-display text-2xl font-semibold">{monitor.key}</div>
        <LatencyChart monitor={monitor} />
      </div>
    </div>
  )
}
