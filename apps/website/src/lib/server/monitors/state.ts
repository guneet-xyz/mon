import type { MonitorTile } from "@mon/config/schema"

import { getMonitorDetails, monitorWarnings } from "./details"
import { getLatestCheck, isStale, statusFromCheck } from "./index"

// Everything a monitor's tile shows: its status, the latest check, what that
// check recorded and any warnings.
export async function getMonitorState(
  config: MonitorTile,
  intervalSeconds?: number,
  now = new Date(),
) {
  const [lastCheck, details] = await Promise.all([
    getLatestCheck(config.type, config.key),
    getMonitorDetails(config.type, config.key, now, {
      disks:
        "disks" in config ? config.disks.map((disk) => disk.name) : undefined,
    }),
  ])
  return {
    status: statusFromCheck(config.type, lastCheck, intervalSeconds, now),
    lastCheck,
    // No check for longer than the monitor's interval allows.
    stale: isStale(lastCheck, intervalSeconds, now),
    details,
    warnings: monitorWarnings(details, now),
  }
}
