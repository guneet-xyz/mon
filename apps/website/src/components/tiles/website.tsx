"use client"

import { useQuery } from "@tanstack/react-query"

import { MonitorDialog } from "@/components/dialogs/monitor-dialog"
import { tileValue } from "@/lib/client/tile-value"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

export function WebsiteTile({
  dbKey,
  r_span,
  c_span,
}: {
  dbKey: string
  r_span: number
  c_span: number
}) {
  const { data, isFetched } = useQuery({
    queryKey: ["monitor-config", "website", dbKey],
    queryFn: async () => await getMonitorTileInfo("website", dbKey),
  })
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status } = data

  if (!config) {
    throw new Error(
      `Website tile with key "${dbKey}" not found in configuration.`,
    )
  }
  const name = config.name ?? config.key

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }

  const urlWithoutProtocol = config.url.replace(/(^\w+:|^)\/\//, "")

  return (
    <MonitorDialog dbKey={dbKey} type="website">
      <BaseTile
        r_span={r_span}
        c_span={c_span}
        title={name}
        short_title={config.short_name}
        bottom_text={tileValue(data.details)}
        warnings={data.warnings}
        top_text={urlWithoutProtocol}
        status={status}
        orientation={orientation}
        icon={config.icon}
        top_right_icon="streamline-ultimate:coding-apps-website-network-globe-bold"
      />
    </MonitorDialog>
  )
}
