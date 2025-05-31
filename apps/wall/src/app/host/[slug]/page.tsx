import { HostIncidents } from "./_components/incidents"
import { HostLatencyChart } from "./_components/latency-chart"

import { getConfig } from "@mon/config"
import { notFound } from "next/navigation"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const config = await getConfig()
  const host = config.hosts.find((host) => host.key === slug)
  if (!host) {
    notFound()
  }

  return (
    <div className="">
      <div className="mb-8 ml-4">
        <div className="font-display text-2xl font-semibold">{host.name}</div>
        <div className="font-display text-neutral-500">{host.address}</div>
      </div>
      <HostLatencyChart hostKey={host.key} />
      <HostIncidents hostKey={host.key} />
    </div>
  )
}
