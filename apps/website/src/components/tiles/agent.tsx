"use client"

import { useQuery } from "@tanstack/react-query"

import { MonitorDialog } from "@/components/dialogs/monitor-dialog"
import { formatSeconds } from "@/lib/client/format"
import { tileValue } from "@/lib/client/tile-value"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

// The machine an agent runs on, as the agent reports it.
export function AgentTile({
  dbKey,
  r_span,
  c_span,
}: {
  dbKey: string
  r_span: number
  c_span: number
}) {
  const { data, isFetched } = useQuery({
    queryKey: ["monitor-config", "agent", dbKey],
    queryFn: async () => await getMonitorTileInfo("agent", dbKey),
  })
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status, details } = data
  if (!config) {
    throw new Error(
      `Agent tile with key "${dbKey}" not found in configuration.`,
    )
  }
  const name = config.name ?? config.key
  // A silent agent's last uptime would be misleading.
  const uptime =
    status === "online" &&
    details.type === "agent" &&
    details.uptimeSeconds !== null
      ? `up ${formatSeconds(details.uptimeSeconds)}`
      : undefined

  return (
    <MonitorDialog dbKey={dbKey} type="agent">
      <BaseTile
        r_span={r_span}
        c_span={c_span}
        title={name}
        short_title={config.short_name}
        bottom_text={tileValue(details)}
        warnings={data.warnings}
        top_text={uptime}
        status={status}
        orientation={c_span === 1 && r_span > 1 ? "vertical" : "horizontal"}
        icon={config.icon}
        top_right_icon="mdi:server"
      />
    </MonitorDialog>
  )
}
