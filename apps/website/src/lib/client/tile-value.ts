import type { MonitorDetails } from "@/lib/server/monitors/details"

import { formatBytes, formatLatency, formatPercent } from "./format"

// The one value a monitor tile shows under its name.
export function tileValue(details: MonitorDetails | undefined): string | null {
  if (!details) return null
  if (details.type === "host" || details.type === "website") {
    return formatLatency(details.latency)
  }
  if (details.type === "container") {
    if (details.state && details.state !== "running") return details.state
    const parts = [formatPercent(details.cpu), formatBytes(details.memory)]
    const shown = parts.filter((part): part is string => part !== null)
    return shown.length > 0 ? shown.join(" · ") : null
  }
  return null
}
