import dayjs from "dayjs"

import type { MonitorDetails } from "@/lib/server/monitors/details"

import {
  formatBytes,
  formatDuration,
  formatLatency,
  formatPercent,
  formatSeconds,
} from "./format"

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
          `Disk ${disk.name}`,
          formatPercent(disk.total > 0 ? (disk.used / disk.total) * 100 : 0),
          ofTotal(disk.used, disk.total),
        ),
      ),
    )
  }

  return stats.filter((s): s is Stat => s !== null)
}
