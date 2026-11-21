import type { Config, MonitorTile } from "@mon/config"
import { and, eq, sql } from "@mon/db/drizzle"
import {
  notificationState,
  type DbSelectNotificationState,
} from "@mon/db/schema"

import { db } from "@/lib/server/db"
import { getStatus } from "@/lib/server/monitors"
import {
  getMonitorDetails,
  monitorWarnings,
} from "@/lib/server/monitors/details"
import type { MonitorStatus } from "@/lib/server/monitors/status"

import { deliver, type Channel, type DeliveryOptions } from "./channels"
import {
  decide,
  describeEvent,
  sameState,
  selectMonitors,
  type NotificationEvent,
  type NotificationState,
  type Observation,
} from "./rules"

const STATUSES = new Set<MonitorStatus>(["online", "offline", "unknown"])

function toState(row: DbSelectNotificationState): NotificationState {
  const notified = row.notifiedStatus
  return {
    notifiedStatus:
      notified === "online" || notified === "offline" ? notified : null,
    observedStatus: STATUSES.has(row.observedStatus as MonitorStatus)
      ? (row.observedStatus as MonitorStatus)
      : "unknown",
    observedSince: row.observedSince,
    warnings: row.warnings,
  }
}

async function observe(
  tile: MonitorTile,
  withWarnings: boolean,
  now: Date,
): Promise<Observation> {
  const status = await getStatus(tile.type, tile.key)
  if (!withWarnings) return { status, warnings: null }
  const details = await getMonitorDetails(tile.type, tile.key, now, {
    disks:
      tile.type === "agent" ? tile.disks.map((disk) => disk.name) : undefined,
  })
  return { status, warnings: monitorWarnings(details, now) }
}

// Records one observation. Returns false when another website instance
// changed the row since it was read, in which case that instance has sent
// (or will send) whatever this change would have.
async function record(
  tile: MonitorTile,
  row: DbSelectNotificationState | undefined,
  next: NotificationState,
  now: Date,
): Promise<boolean> {
  if (!row) {
    await db
      .insert(notificationState)
      .values({ type: tile.type, key: tile.key, ...next, updatedAt: now })
      .onConflictDoNothing()
    return true
  }
  if (sameState(toState(row), next)) return true
  const updated = await db
    .update(notificationState)
    .set({
      ...next,
      revision: sql`${notificationState.revision} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationState.type, tile.type),
        eq(notificationState.key, tile.key),
        eq(notificationState.revision, row.revision),
      ),
    )
    .returning({ revision: notificationState.revision })
  return updated.length > 0
}

export type EvaluateOptions = {
  config: Config
  channels: Channel[]
  now?: Date
  delivery?: DeliveryOptions
}

// One pass over every monitor: observe it, store what changed and send the
// alerts that are due. Returns the events it sent (or tried to send).
export async function evaluateNotifications({
  config,
  channels,
  now = new Date(),
  delivery,
}: EvaluateOptions): Promise<NotificationEvent[]> {
  const settings = config.notifications
  if (!settings.enabled || channels.length === 0) return []

  const rows = new Map(
    (await db.select().from(notificationState)).map((row) => [
      `${row.type}:${row.key}`,
      row,
    ]),
  )

  const events: NotificationEvent[] = []
  for (const tile of selectMonitors(config)) {
    try {
      const observation = await observe(tile, settings.warnings, now)
      const row = rows.get(`${tile.type}:${tile.key}`)
      const { next, events: due } = decide(
        row && toState(row),
        observation,
        settings.grace_period_seconds * 1000,
        now,
      )
      if (!(await record(tile, row, next, now))) continue
      const monitor = {
        type: tile.type,
        key: tile.key,
        name: tile.name ?? tile.key,
      }
      for (const event of due) {
        events.push({
          ...event,
          ...describeEvent(event, monitor, next.observedSince),
          monitor,
          status: observation.status,
          since: next.observedSince,
          at: now,
          url: settings.board_url,
        })
      }
    } catch (err) {
      console.error(
        `[notifications] could not evaluate ${tile.type} "${tile.key}":`,
        err,
      )
    }
  }

  await Promise.all(
    events.flatMap((event) =>
      channels.map((channel) => deliver(channel, event, delivery)),
    ),
  )
  return events
}
