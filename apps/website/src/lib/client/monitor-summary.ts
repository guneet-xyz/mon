import dayjs from "dayjs"

import type { MonitorDetails } from "@/lib/server/monitors/details"
import type { HistoryRange, Uptime } from "@/lib/server/monitors/history"
import { diskLabel } from "@/lib/tile-state"

import {
  formatBytes,
  formatDuration,
  formatLatency,
  formatPercent,
  formatSeconds,
  formatUptime,
} from "./format"

const CONCLUSIONS: Record<string, string> = {
  success: "Passed",
  failure: "Failed",
  neutral: "Neutral",
  cancelled: "Cancelled",
  skipped: "Skipped",
  timed_out: "Timed out",
  action_required: "Action required",
}

export type Stat = { label: string; value: string; detail?: string }

// The current-state summary at the top of a monitor's dialog. Values the
// latest check did not record are left out.
export function monitorSummary(
  details: MonitorDetails | undefined,
  now: Date = new Date(),
): Stat[] {
  const stats: Array<Stat | null> = []
  const stat = (label: string, value: string | null, detail?: string) =>
    value === null ? null : { label, value, ...(detail ? { detail } : {}) }

  if (!details) return []

  if (details.type === "host") {
    stats.push(stat("Latency", formatLatency(details.latency)))
  }

  if (details.type === "website") {
    stats.push(
      stat(
        "HTTP status",
        details.statusCode === null ? null : String(details.statusCode),
        details.redirectLocation ? `→ ${details.redirectLocation}` : undefined,
      ),
      stat("Response time", formatLatency(details.latency)),
    )
    if (details.certExpiresAt) {
      const days = Math.floor(
        (details.certExpiresAt.getTime() - now.getTime()) / 86_400_000,
      )
      stats.push(
        stat(
          "Certificate",
          days < 0
            ? "Expired"
            : `Expires in ${days} ${days === 1 ? "day" : "days"}`,
          dayjs(details.certExpiresAt).format("YYYY-MM-DD"),
        ),
      )
    }
  }

  if (details.type === "container") {
    const running = details.state === "running"
    stats.push(
      stat(
        "State",
        details.state,
        details.health ? `health: ${details.health}` : undefined,
      ),
      running && details.startedAt
        ? stat("Up for", formatDuration(details.startedAt, now))
        : null,
      stat(
        "Restarts",
        details.restartCount === null ? null : String(details.restartCount),
        details.restarts24h ? `${details.restarts24h} in 24 h` : undefined,
      ),
      running ? stat("CPU", formatPercent(details.cpu)) : null,
      running
        ? stat(
            "Memory",
            formatBytes(details.memory),
            details.memoryLimit
              ? `of ${formatBytes(details.memoryLimit)}`
              : undefined,
          )
        : null,
      stat("Image", details.image, details.imageVersion ?? undefined),
      !running && details.exitCode !== null
        ? stat(
            "Last exit code",
            String(details.exitCode),
            details.oomKilled ? "killed: out of memory" : undefined,
          )
        : null,
    )
  }

  if (details.type === "agent") {
    const ofTotal = (used: number, total: number) =>
      `${formatBytes(used)} of ${formatBytes(total)}`
    stats.push(
      stat("CPU", formatPercent(details.cpu)),
      details.memory !== null && details.memoryTotal
        ? stat(
            "Memory",
            formatPercent((details.memory / details.memoryTotal) * 100),
            ofTotal(details.memory, details.memoryTotal),
          )
        : null,
      details.uptimeSeconds === null
        ? null
        : stat("Up for", formatSeconds(details.uptimeSeconds)),
      ...details.disks.map((disk) =>
        stat(
          diskLabel(disk.name),
          formatPercent(disk.total > 0 ? (disk.used / disk.total) * 100 : 0),
          ofTotal(disk.used, disk.total),
        ),
      ),
    )
  }

  if (details.type === "github") {
    stats.push(
      ...details.checks.map((check) =>
        stat(
          check.name,
          check.status === "completed"
            ? (CONCLUSIONS[check.conclusion ?? ""] ?? "Done")
            : "Running",
        ),
      ),
    )
  }

  return stats.filter((s): s is Stat => s !== null)
}

const DAY_MS = 24 * 60 * 60 * 1000
const RANGES: Array<{ range: HistoryRange; label: string; ms: number }> = [
  { range: "24h", label: "24 h", ms: DAY_MS },
  { range: "7d", label: "7 d", ms: 7 * DAY_MS },
  { range: "30d", label: "30 d", ms: 30 * DAY_MS },
]

// "20 h", "3 d": how much history there is, roughly.
function coverage(ms: number): string {
  const hours = Math.max(1, Math.round(ms / 3_600_000))
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

// Uptime per range. A range the monitor's history does not cover yet says
// how much it does cover, so "100%" over 7 days isn't read from one day.
export function uptimeStats(
  uptime: Uptime | undefined,
  firstCheck: Date | null | undefined,
  now: Date = new Date(),
): Stat[] {
  return RANGES.map(({ range, label, ms }) => {
    const ratio = uptime?.[range] ?? null
    const value = formatUptime(ratio) ?? "—"
    if (ratio === null || !firstCheck) return { label, value }
    const covered = now.getTime() - firstCheck.getTime()
    return covered < ms * 0.9
      ? {
          label,
          value,
          detail: `Only ${coverage(covered)} of data`,
        }
      : { label, value }
  })
}
