import { env } from "@/env"
import { getCachedConfig } from "@/lib/server/config-cache"

import { resolveChannels, type Channel } from "./channels"
import { evaluateNotifications } from "./evaluate"

// Agents report every 60 s by default; checking twice as often keeps alerts
// within about half a poll of the status change.
export const EVALUATE_INTERVAL_MS = 30_000

const globalForLoop = globalThis as unknown as {
  monNotificationLoop: { stop: () => void } | undefined
}

// Starts the background evaluation, unless no channel is configured, in
// which case nothing runs and nothing is written. Safe to call more than
// once (dev reloads): only the first call starts a loop.
export function startNotificationLoop(
  source: Record<string, string | undefined> = env,
  {
    intervalMs = EVALUATE_INTERVAL_MS,
    run = runOnce,
  }: { intervalMs?: number; run?: (channels: Channel[]) => Promise<void> } = {},
): { stop: () => void } | null {
  if (globalForLoop.monNotificationLoop)
    return globalForLoop.monNotificationLoop

  const { channels, errors } = resolveChannels(source)
  for (const error of errors) console.error(`[notifications] ${error}`)
  if (channels.length === 0) return null
  console.log(
    `[notifications] sending to ${channels.map((c) => c.name).join(" and ")}`,
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const tick = async () => {
    await run(channels)
    if (!stopped) {
      timer = setTimeout(() => void tick(), intervalMs)
      timer.unref?.()
    }
  }
  timer = setTimeout(() => void tick(), 0)
  timer.unref?.()

  const loop = {
    stop: () => {
      stopped = true
      clearTimeout(timer)
      globalForLoop.monNotificationLoop = undefined
    },
  }
  globalForLoop.monNotificationLoop = loop
  return loop
}

async function runOnce(channels: Channel[]): Promise<void> {
  try {
    const config = await getCachedConfig()
    await evaluateNotifications({ config, channels })
  } catch (err) {
    console.error("[notifications] evaluation failed:", err)
  }
}
