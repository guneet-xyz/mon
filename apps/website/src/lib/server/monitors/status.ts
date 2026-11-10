import dayjs from "dayjs"

export type MonitorStatus = "online" | "offline" | "unknown"

// Agents ping every minute; a monitor with no ping for longer than this is
// treated as unknown rather than keeping its last status.
export const STALE_AFTER_MINUTES = 2

export function statusFromLatestPing(
  ping: { timestamp: Date; error: string | null } | undefined,
  now: Date = new Date(),
): MonitorStatus {
  if (!ping) return "unknown"
  if (dayjs(now).diff(dayjs(ping.timestamp), "minute") > STALE_AFTER_MINUTES)
    return "unknown"
  if (ping.error) return "offline"
  return "online"
}
