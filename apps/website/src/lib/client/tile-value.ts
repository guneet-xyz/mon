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
    return labelled([
      ["CPU", formatPercent(details.cpu)],
      ["MEM", formatBytes(details.memory)],
    ])
  }
  if (details.type === "agent") {
    const percent = (used: number | null, total: number | null) =>
      used !== null && total ? (used / total) * 100 : null
    const fullest = details.disks.reduce<number | null>(
      (max, disk) => Math.max(max ?? 0, percent(disk.used, disk.total) ?? 0),
      null,
    )
    return labelled([
      ["CPU", formatPercent(details.cpu)],
      ["MEM", formatPercent(percent(details.memory, details.memoryTotal))],
      ["DISK", formatPercent(fullest)],
    ])
  }
  if (details.type === "github") {
    const total = details.checks.length
    if (total === 0) return null
    const running = details.checks.filter(
      (check) => check.status !== "completed",
    ).length
    if (running > 0) return `${running} of ${total} checks running`
    const passed = details.checks.filter((check) =>
      PASSED.has(check.conclusion ?? ""),
    ).length
    return `${passed}/${total} checks passed`
  }
  return null
}

const PASSED = new Set(["success", "neutral", "skipped"])

// "CPU 12% · MEM 350 MB", leaving out values the check did not record.
function labelled(parts: Array<[string, string | null]>): string | null {
  const shown = parts.filter((part): part is [string, string] => !!part[1])
  return shown.length > 0
    ? shown.map(([label, value]) => `${label} ${value}`).join(" · ")
    : null
}
