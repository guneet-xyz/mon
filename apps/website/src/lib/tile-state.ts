import type { MonitorStatus } from "@/lib/server/monitors/status"

// How a tile looks: "down" and "warning" need attention, "unknown" has no
// fresh data, "ok" is healthy. Used by monitor and group tiles alike.
export type Tone = "ok" | "warning" | "down" | "unknown"

export function toneOf(status: MonitorStatus, warnings: number): Tone {
  if (status === "offline") return "down"
  if (status === "unknown") return "unknown"
  return warnings > 0 ? "warning" : "ok"
}

// The monitors in a group, nested groups included, each counted once.
export type GroupSummary = {
  total: number
  up: number
  down: number
  unknown: number
  // Monitors that are up but have a warning.
  warnings: number
}

export function summarize(
  monitors: Array<{ status: MonitorStatus; warnings: number }>,
): GroupSummary {
  const summary = { total: 0, up: 0, down: 0, unknown: 0, warnings: 0 }
  for (const { status, warnings } of monitors) {
    summary.total++
    if (status === "online") summary.up++
    if (status === "offline") summary.down++
    if (status === "unknown") summary.unknown++
    if (status === "online" && warnings > 0) summary.warnings++
  }
  return summary
}

// The worst state among a group's monitors.
export function groupTone(summary: GroupSummary): Tone {
  if (summary.down > 0) return "down"
  if (summary.warnings > 0) return "warning"
  if (summary.unknown > 0 || summary.total === 0) return "unknown"
  return "ok"
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// What a group tile says about its monitors, worst first.
export function groupMessage(summary: GroupSummary): string {
  const parts: string[] = []
  if (summary.down > 0) parts.push(`${summary.down} down`)
  if (summary.warnings > 0) parts.push(plural(summary.warnings, "warning"))
  if (summary.unknown > 0) parts.push(`${summary.unknown} no data`)
  if (parts.length === 0) {
    return summary.total === 0
      ? "No monitors"
      : `${summary.up}/${summary.total} up`
  }
  return parts.join(" · ")
}

export function upCount(summary: GroupSummary): string {
  return `${summary.up}/${summary.total} up`
}
