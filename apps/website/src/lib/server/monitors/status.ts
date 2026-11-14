export type MonitorStatus = "online" | "offline" | "unknown"

// Agents run every job once per poll (AGENT_POLL_INTERVAL_SECONDS, 60s by
// default). A monitor with no ping for longer than this is shown as unknown
// rather than keeping its last status.
export const STALE_AFTER_MS = 3 * 60_000

export function statusFromLatestPing(
  ping: { timestamp: Date; error: string | null } | undefined,
  now: Date = new Date(),
): MonitorStatus {
  if (!ping) return "unknown"
  if (now.getTime() - ping.timestamp.getTime() > STALE_AFTER_MS)
    return "unknown"
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
): MonitorStatus {
  if (!report) return "unknown"
  if (now.getTime() - report.timestamp.getTime() > STALE_AFTER_MS)
    return "offline"
  return report.error ? "offline" : "online"
}

export const NO_REPORT = "No report from the agent"

// Periods with no report for longer than STALE_AFTER_MS, between `from` and
// `now`. Timestamps must be sorted. Silence before the first report in the
// range is not counted: the agent may not have existed yet.
export function reportGaps(
  timestamps: Date[],
  now: Date = new Date(),
): Array<{ start: Date; end: Date; error: string }> {
  const gaps: Array<{ start: Date; end: Date; error: string }> = []
  for (let i = 1; i <= timestamps.length; i++) {
    const previous = timestamps[i - 1]!
    const next = timestamps[i] ?? now
    if (next.getTime() - previous.getTime() > STALE_AFTER_MS) {
      gaps.push({ start: previous, end: next, error: NO_REPORT })
    }
  }
  return gaps
}
