"use client"

import type { PublicMonitorTile } from "@mon/config/schema"

import { MonitorDialog } from "@/components/dialogs/monitor-dialog"
import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getGroupTileInfo } from "@/lib/server/actions/get-group-tile-info"

import { useQuery } from "@tanstack/react-query"

const MEMBER_ICONS: Record<PublicMonitorTile["type"], string> = {
  host: "clarity:host-line",
  website: "streamline-ultimate:coding-apps-website-network-globe-bold",
  container: "mdi:docker",
  github: "mdi:github",
}

function memberDetail(member: PublicMonitorTile): string {
  if (member.type === "host") return member.address
  if (member.type === "website") return member.url.replace(/(^\w+:|^)\/\//, "")
  if (member.type === "container") return member.container_name
  if (member.type === "github") return member.repo

  throw new Error(`How did we get here?`)
}

export function GroupDialog({
  dbKey,
  children,
}: {
  dbKey: string
  children: React.ReactNode
}) {
  const { data } = useQuery({
    queryKey: ["group-config", dbKey],
    queryFn: async () => await getGroupTileInfo(dbKey),
  })

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full !max-w-none p-4 sm:w-auto sm:min-w-96 sm:p-8">
        <DialogHeader>
          {data ? (
            <>
              <DialogTitle>{data.config.name ?? data.config.key}</DialogTitle>
              <DialogDescription className="flex justify-between gap-4">
                <span>{data.config.key}</span>
                <Badge variant="default" className="uppercase">
                  group
                </Badge>
              </DialogDescription>
            </>
          ) : null}
        </DialogHeader>
        <ul className="mt-4 flex flex-col gap-2">
          {data?.members.map(({ config, status }) => (
            <li key={`${config.type}:${config.key}`}>
              <MonitorDialog type={config.type} dbKey={config.key}>
                <button
                  type="button"
                  data-testid="group-member"
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-neutral-500/50 bg-neutral-900/30 px-4 py-3 text-left transition-colors hover:bg-neutral-500/20"
                >
                  <StatusDot status={status} className="shrink-0" />
                  <div className="min-w-0 grow">
                    <div className="truncate font-medium">
                      {config.name ?? config.key}
                    </div>
                    <div className="truncate text-sm text-neutral-500">
                      {memberDetail(config)}
                    </div>
                  </div>
                  <DynamicIcon
                    icon={MEMBER_ICONS[config.type]}
                    className="size-4 shrink-0 text-neutral-500"
                  />
                </button>
              </MonitorDialog>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
