import type { MonitorTile } from "@mon/config/schema"

import { getMonitorDetails, monitorWarnings } from "./details"
import { getLatestCheck, statusFromCheck } from "./index"

// Everything a monitor's tile shows: its status, the latest check, what that
// check recorded and any warnings.
export async function getMonitorState(config: MonitorTile, now = new Date()) {
  const [lastCheck, details] = await Promise.all([
    getLatestCheck(config.type, config.key),
    getMonitorDetails(config.type, config.key, now, {
      disks:
        "disks" in config ? config.disks.map((disk) => disk.name) : undefined,
    }),
  ])
  return {
    status: statusFromCheck(config.type, lastCheck, now),
    lastCheck,
    details,
    warnings: monitorWarnings(details, now),
  }
}
