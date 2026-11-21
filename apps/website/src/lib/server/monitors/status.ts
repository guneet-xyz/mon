export type MonitorStatus = "online" | "offline" | "unknown"

// Agents check each monitor every interval_seconds (a minute by default). A
// monitor with no ping for 3 minutes, or 3 intervals if that is longer, is
// shown as unknown rather than keeping its last status.
export const STALE_AFTER_MS = 3 * 60_000

export function staleAfterMs(intervalSeconds = 60): number {
  return Math.max(STALE_AFTER_MS, 3 * intervalSeconds * 1000)
}

export function statusFromLatestPing(
  ping: { timestamp: Date; error: string | null } | undefined,
  now: Date = new Date(),
  staleAfter = STALE_AFTER_MS,
): MonitorStatus {
  if (!ping) return "unknown"
  if (now.getTime() - ping.timestamp.getTime() > staleAfter) return "unknown"
  if (ping.error) return "offline"
  return "online"
}

// A group is offline if any member is, unknown if any member has no fresh
// status, and online only when every member is online.
export function groupStatus(statuses: MonitorStatus[]): MonitorStatus {
  if (statuses.includes("offline")) return "offline"
  if (statuses.length === 0 || statuses.includes("unknown")) return "unknown"
  return "online"
}

// An agent reports about its own machine, so silence means the machine (or
// the agent) is down: offline rather than unknown once its report is stale.
export function agentStatusFromLatestReport(
  report: { timestamp: Date; error: string | null } | undefined,
  now: Date = new Date(),
  staleAfter = STALE_AFTER_MS,
): MonitorStatus {
  if (!report) return "unknown"
  if (now.getTime() - report.timestamp.getTime() > staleAfter) return "offline"
  return report.error ? "offline" : "online"
}

export const NO_REPORT = "No report from the agent"

// Periods with no report for longer than `staleAfter`, between `from` and
// `now`. Timestamps must be sorted. Silence before the first report in the
// range is not counted: the agent may not have existed yet.
export function reportGaps(
  timestamps: Date[],
  now: Date = new Date(),
  staleAfter = STALE_AFTER_MS,
): Array<{ start: Date; end: Date; error: string }> {
  const gaps: Array<{ start: Date; end: Date; error: string }> = []
  for (let i = 1; i <= timestamps.length; i++) {
    const previous = timestamps[i - 1]!
    const next = timestamps[i] ?? now
    if (next.getTime() - previous.getTime() > staleAfter) {
      gaps.push({ start: previous, end: next, error: NO_REPORT })
    }
  }
  return gaps
}

// Consecutive failed checks with the same error form one incident, which
// lasts until a check interval (at least a minute) after the last of them.
// Pings must be sorted.
export function groupFailures(
  pings: Array<{ timestamp: Date; error: string }>,
  intervalSeconds = 60,
): Array<{ start: Date; end: Date; error: string }> {
  const stepMs = Math.max(60, intervalSeconds) * 1000
  const incidents: Array<{ start: Date; end: Date; error: string }> = []

  for (const ping of pings) {
    const end = new Date(ping.timestamp.getTime() + stepMs)
    const current = incidents.at(-1)
    if (
      current?.error === ping.error &&
      ping.timestamp.getTime() - current.end.getTime() < 2 * stepMs
    ) {
      current.end = end
    } else {
      incidents.push({ start: ping.timestamp, end, error: ping.error })
    }
  }
  return incidents
}
