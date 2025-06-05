import { HostLatencyChart } from "./host"

import type { Monitor } from "@mon/config/schema"

export function LatencyChart({ monitor }: { monitor: Monitor }) {
  if (monitor.type === "host") {
    return (
      <div>
        <HostLatencyChart dbKey={monitor.key} />
      </div>
    )
  }
  return <div>not implemented</div>
}
