import { Navbar } from "@/app/_components/navbar"

import { Incidents } from "./_components/incidents"
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
    <div className="h-screen p-4">
      <Navbar />
      <div className="">
        <div className="flex items-center gap-4">
          <div className="mr-auto font-display text-2xl font-semibold dark:text-neutral-200">
            {monitor.name ?? monitor.key}
          </div>
          {monitor.key !== monitor.name ? (
            <div className="rounded-full bg-emerald-200 px-2 font-display font-semibold text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200">
              {monitor.key}
            </div>
          ) : null}
          <div className="rounded-full bg-emerald-200 px-2 font-display font-semibold text-emerald-800 uppercase dark:bg-emerald-800 dark:text-emerald-200">
            {monitor.type}
          </div>
        </div>
        <div className="mb-4 font-display text-2xl font-bold">Latency</div>
        <LatencyChart monitor={monitor} />
        <div className="mb-4 font-display text-2xl font-bold">Incidents</div>
        <Incidents type={monitor.type} dbKey={monitor.key} />
      </div>
    </div>
  )
}
