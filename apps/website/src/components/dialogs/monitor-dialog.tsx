"use client"

import type { MonitorTile } from "@mon/config/schema"

import { Incidents } from "@/components/dialogs/incidents"
import { LatencyChart } from "@/components/dialogs/latency-chart"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"

import { useQuery } from "@tanstack/react-query"

export function MonitorDialog({
  type,
  dbKey,
  children,
}: {
  type: MonitorTile["type"]
  dbKey: string
  children: React.ReactNode
}) {
  const { data } = useQuery({
    queryKey: ["monitorConfig", type, dbKey],
    queryFn: async () => await getMonitorTileInfo(type, dbKey),
  })

  const config = data?.config

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full !max-w-none p-4 sm:w-auto sm:p-8">
        <DialogHeader>
          {config ? (
            <>
              <DialogTitle>{config.name ?? config.key}</DialogTitle>
              <DialogDescription className="flex justify-between">
                <div>{config.key ?? ""}</div>
                <div>
                  <Badge variant="default" className="uppercase">
                    {type}
                  </Badge>
                </div>
              </DialogDescription>
            </>
          ) : null}
        </DialogHeader>
        <div>
          <div className="mt-4 mb-2 font-medium">Latency</div>
          <div className="rounded-xl border border-dashed border-neutral-500/50 bg-neutral-900/30 p-4 text-neutral-500">
            <LatencyChart type={type} dbKey={dbKey} />
          </div>
          <div className="mt-4 mb-2 font-medium">Incidents</div>
          <div className="max-h-64 overflow-y-scroll rounded-xl border border-dashed border-neutral-500/50 bg-neutral-900/30 p-4 text-neutral-500">
            <Incidents type={type} dbKey={dbKey} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
