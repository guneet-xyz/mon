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
