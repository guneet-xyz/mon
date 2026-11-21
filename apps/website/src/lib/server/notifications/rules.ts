import {
  getGroupMembers,
  getMonitorTiles,
  type Config,
  type GroupTile,
  type MonitorTile,
} from "@mon/config"

import type { MonitorStatus } from "@/lib/server/monitors/status"

export type MonitorRef = {
  type: MonitorTile["type"]
  key: string
  name: string
}

export type NotificationEvent = {
  kind: "down" | "recovered" | "warning"
  monitor: MonitorRef
  status: MonitorStatus
  // For warning events, the warnings that are new.
  warnings: string[]
  // When the monitor entered its current status.
  since: Date
  at: Date
  title: string
  message: string
  url?: string
}

export type NotificationState = {
  notifiedStatus: "online" | "offline" | null
  observedStatus: MonitorStatus
  observedSince: Date
  // Keys (see warningKey) of the warnings already notified.
  warnings: string[]
}

export type Observation = {
  status: MonitorStatus
  // Current warning messages; null when warning alerts are off.
  warnings: string[] | null
}

// Warning messages carry numbers that change every check ("Disk / 91% full",
// "Certificate expires in 13 days"). The key leaves them out so the same
// warning is only notified once.
export function warningKey(message: string): string {
  return message.replace(/\d+(\s+(day|time)s?\b)?/g, "#")
}

// The monitors to alert on: every monitor, or those `include` names
// (directly or through a group), minus those `mute` names. Monitors sharing
// a type and key share their pings, so they are listed once.
export function selectMonitors(config: Config): MonitorTile[] {
  const { include, mute } = config.notifications
  const monitors = getMonitorTiles(config)
  const groups = new Map(
    config.tiles
      .filter((tile): tile is GroupTile => tile.type === "group")
      .map((group) => [group.key, group]),
  )
  const expand = (keys: string[]): Set<string> => {
    const found = new Set<string>()
    const seenGroups = new Set<string>()
    const visit = (key: string) => {
      const group = groups.get(key)
      if (group) {
        if (seenGroups.has(key)) return
        seenGroups.add(key)
        for (const member of getGroupMembers(config, group)) visit(member.key)
      } else {
        found.add(key)
      }
    }
    keys.forEach(visit)
    return found
  }
  const included = include ? expand(include) : null
  const muted = expand(mute)
  const seen = new Set<string>()
  return monitors.filter((tile) => {
    const id = `${tile.type}:${tile.key}`
    if (seen.has(id)) return false
    seen.add(id)
    return (!included || included.has(tile.key)) && !muted.has(tile.key)
  })
}

type Decision = {
  next: NotificationState
  events: Array<Pick<NotificationEvent, "kind" | "warnings">>
}

// What to remember and announce after observing a monitor.
// - The first observation is stored silently, so starting up (or adding a
//   monitor) doesn't send an alert for problems that already existed.
// - A monitor that is down for the grace period is announced once, however
//   long it stays down, and once more when it is back online.
// - "unknown" (no recent data) neither alerts nor recovers. A silent agent
//   is reported as offline by the status logic, so it does alert.
// - New warnings are announced once; one that clears and comes back is new.
export function decide(
  state: NotificationState | undefined,
  observation: Observation,
  graceMs: number,
  now: Date,
): Decision {
  const { status } = observation
  const currentWarnings = observation.warnings ?? []
  if (!state) {
    return {
      next: {
        notifiedStatus: status === "unknown" ? null : status,
        observedStatus: status,
        observedSince: now,
        warnings: [...new Set(currentWarnings.map(warningKey))],
      },
      events: [],
    }
  }

  const observedSince =
    status === state.observedStatus ? state.observedSince : now
  let notifiedStatus = state.notifiedStatus
  const events: Decision["events"] = []

  if (
    status === "offline" &&
    notifiedStatus !== "offline" &&
    now.getTime() - observedSince.getTime() >= graceMs
  ) {
    notifiedStatus = "offline"
    events.push({ kind: "down", warnings: [] })
  } else if (status === "online" && notifiedStatus === "offline") {
    notifiedStatus = "online"
    events.push({ kind: "recovered", warnings: [] })
  } else if (status === "online" && notifiedStatus === null) {
    notifiedStatus = "online"
  }

  let warnings = state.warnings
  if (observation.warnings) {
    const known = new Set(state.warnings)
    const added = new Map<string, string>()
    for (const message of observation.warnings) {
      const key = warningKey(message)
      if (!known.has(key) && !added.has(key)) added.set(key, message)
    }
    if (added.size > 0)
      events.push({ kind: "warning", warnings: [...added.values()] })
    warnings = [...new Set(observation.warnings.map(warningKey))]
  }

  return {
    next: { notifiedStatus, observedStatus: status, observedSince, warnings },
    events,
  }
}

export function sameState(a: NotificationState, b: NotificationState): boolean {
  return (
    a.notifiedStatus === b.notifiedStatus &&
    a.observedStatus === b.observedStatus &&
    a.observedSince.getTime() === b.observedSince.getTime() &&
    a.warnings.length === b.warnings.length &&
    a.warnings.every((warning, i) => warning === b.warnings[i])
  )
}

const TYPE_LABELS: Record<MonitorTile["type"], string> = {
  host: "Host",
  website: "Website",
  container: "Container",
  github: "GitHub repository",
  agent: "Agent",
}

export function describeEvent(
  event: Pick<NotificationEvent, "kind" | "warnings">,
  monitor: MonitorRef,
  since: Date,
): Pick<NotificationEvent, "title" | "message"> {
  const label = `${TYPE_LABELS[monitor.type]} ${monitor.name}`
  const at = since.toISOString().replace(/\.\d+Z$/, "Z")
  if (event.kind === "down") {
    return {
      title: `${monitor.name} is down`,
      message:
        monitor.type === "agent"
          ? `${label} is offline or has stopped reporting (since ${at}).`
          : `${label} is down (since ${at}).`,
    }
  }
  if (event.kind === "recovered") {
    return {
      title: `${monitor.name} recovered`,
      message: `${label} is back online (since ${at}).`,
    }
  }
  return {
    title: `${monitor.name}: ${event.warnings.join(", ")}`,
    message: `${label}: ${event.warnings.join("; ")}.`,
  }
}
