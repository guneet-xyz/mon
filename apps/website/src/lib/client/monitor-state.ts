import type { MonitorTile } from "@mon/config/schema"

import type { LatestCheck } from "@/lib/server/monitors"
import type { MonitorDetails } from "@/lib/server/monitors/details"
import {
  STALE_AFTER_MS,
  type MonitorStatus,
} from "@/lib/server/monitors/status"
import { toneOf, type Tone } from "@/lib/tile-state"

import { formatSeconds } from "./format"
import { tileValue } from "./tile-value"

export type MonitorState = {
  tone: Tone
  // What the tile says under its name: the problem when there is one,
  // otherwise the current value.
  message: string | null
}

export function timeSince(date: Date, now: Date = new Date()): string {
  return formatSeconds(Math.max(60, (now.getTime() - date.getTime()) / 1000))
}

export function monitorState(
  info: {
    status: MonitorStatus
    details: MonitorDetails
    warnings: string[]
    lastCheck: LatestCheck | null
  },
  type: MonitorTile["type"],
  now: Date = new Date(),
): MonitorState {
  const { status, details, warnings, lastCheck } = info
  const tone = toneOf(status, warnings.length)

  if (tone === "down") {
    // An agent that stopped reporting: its last numbers are not current.
    if (
      type === "agent" &&
      lastCheck &&
      now.getTime() - lastCheck.timestamp.getTime() > STALE_AFTER_MS
    ) {
      return {
        tone,
        message: `No report for ${timeSince(lastCheck.timestamp, now)}`,
      }
    }
    if (
      details.type === "container" &&
      details.state &&
      details.state !== "running"
    ) {
      return { tone, message: `Down · ${details.state}` }
    }
    return { tone, message: `Down · ${lastCheck?.error ?? "no response"}` }
  }

  if (tone === "unknown") {
    if (!lastCheck) return { tone, message: "No data yet" }
    return {
      tone,
      message: `No check for ${timeSince(lastCheck.timestamp, now)}`,
    }
  }

  if (tone === "warning") {
    const more = warnings.length > 1 ? ` (+${warnings.length - 1})` : ""
    return { tone, message: `${warnings[0]}${more}` }
  }

  return { tone, message: tileValue(details) }
}
