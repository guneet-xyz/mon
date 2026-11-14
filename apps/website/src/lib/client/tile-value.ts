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
  if (details.type === "agent") {
    const percent = (used: number | null, total: number | null) =>
      used !== null && total ? (used / total) * 100 : null
    const fullest = details.disks.reduce<number | null>(
      (max, disk) => Math.max(max ?? 0, percent(disk.used, disk.total) ?? 0),
      null,
    )
    const parts = [
      ["CPU", formatPercent(details.cpu)],
      ["MEM", formatPercent(percent(details.memory, details.memoryTotal))],
      ["DISK", formatPercent(fullest)],
    ].filter((part): part is [string, string] => part[1] !== null)
    return parts.length > 0
      ? parts.map(([label, value]) => `${label} ${value}`).join(" · ")
      : null
  }
  return null
}
