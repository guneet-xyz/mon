import type { MonitorTile } from "@mon/config/schema"
import { and, asc, desc, eq, gte, isNotNull } from "@mon/db/drizzle"
import { containerPings, hostPings, websitePings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

export const CERT_WARNING_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type MonitorDetails =
  | { type: "host"; latency: number | null }
  | {
      type: "website"
      latency: number | null
      statusCode: number | null
      redirectLocation: string | null
      certExpiresAt: Date | null
    }
  | {
      type: "container"
      state: string | null
      health: string | null
      restartCount: number | null
      // Restarts since the oldest check in the last 24 hours.
      restarts24h: number | null
      startedAt: Date | null
      exitCode: number | null
      oomKilled: boolean | null
      image: string | null
      imageVersion: string | null
      cpu: number | null
      memory: number | null
      memoryLimit: number | null
    }
  | { type: "github" }

// What the latest check recorded. Fields stay null until an agent from
// v0.8.0 or later has checked the monitor.
export async function getMonitorDetails(
  type: MonitorTile["type"],
  key: string,
  now = new Date(),
): Promise<MonitorDetails> {
  if (type === "host") {
    const [row] = await db
      .select({ latency: hostPings.latency })
      .from(hostPings)
      .where(eq(hostPings.key, key))
      .orderBy(desc(hostPings.timestamp))
      .limit(1)
    return { type, latency: row?.latency ?? null }
  }

  if (type === "website") {
    const [row] = await db
      .select()
      .from(websitePings)
      .where(eq(websitePings.key, key))
      .orderBy(desc(websitePings.timestamp))
      .limit(1)
    return {
      type,
      latency: row?.latency ?? null,
      statusCode: row?.statusCode ?? null,
      redirectLocation: row?.redirectLocation ?? null,
      certExpiresAt: row?.certExpiresAt ?? null,
    }
  }

  if (type === "container") {
    const [row] = await db
      .select()
      .from(containerPings)
      .where(eq(containerPings.key, key))
      .orderBy(desc(containerPings.timestamp))
      .limit(1)
    const [oldest] = await db
      .select({ restartCount: containerPings.restartCount })
      .from(containerPings)
      .where(
        and(
          eq(containerPings.key, key),
          isNotNull(containerPings.restartCount),
          gte(containerPings.timestamp, new Date(now.getTime() - DAY_MS)),
        ),
      )
      .orderBy(asc(containerPings.timestamp))
      .limit(1)
    const latest = row?.restartCount ?? null
    const first = oldest?.restartCount ?? null
    return {
      type,
      state: row?.state ?? null,
      health: row?.health ?? null,
      restartCount: latest,
      // A recreated container starts counting from 0 again.
      restarts24h:
        latest !== null && first !== null && latest >= first
          ? latest - first
          : null,
      startedAt: row?.startedAt ?? null,
      exitCode: row?.exitCode ?? null,
      oomKilled: row?.oomKilled ?? null,
      image: row?.image ?? null,
      imageVersion: row?.imageVersion ?? null,
      cpu: row?.cpuPercent ?? null,
      memory: row?.memoryBytes ?? null,
      memoryLimit: row?.memoryLimitBytes ?? null,
    }
  }

  return { type }
}

// Problems worth flagging on a tile even while the monitor is up.
export function monitorWarnings(
  details: MonitorDetails,
  now = new Date(),
): string[] {
  const warnings: string[] = []
  if (details.type === "website" && details.certExpiresAt) {
    const days = Math.floor(
      (details.certExpiresAt.getTime() - now.getTime()) / DAY_MS,
    )
    if (days < 0) warnings.push("Certificate expired")
    else if (days < CERT_WARNING_DAYS)
      warnings.push(
        `Certificate expires in ${days} ${days === 1 ? "day" : "days"}`,
      )
  }
  if (details.type === "container") {
    if (details.health === "unhealthy") warnings.push("Health check failing")
    if (details.state === "restarting") warnings.push("Restarting")
    if (details.restarts24h)
      warnings.push(
        `Restarted ${details.restarts24h} ${details.restarts24h === 1 ? "time" : "times"} in 24 h`,
      )
  }
  return warnings
}
