import { readFileSync } from "fs"

import type { NotificationEvent } from "./rules"

export type ChannelRequest = { url: string; init: RequestInit }

export type Channel = {
  name: "ntfy" | "webhook"
  request: (event: NotificationEvent) => ChannelRequest
}

type Source = Record<string, string | undefined>

// A secret comes from NAME, or else from the file named by NAME_FILE (for
// example a Docker secret). Empty values count as unset.
function readSecret(
  source: Source,
  name: string,
  readFile: (path: string) => string,
): string | undefined {
  const value = source[name]?.trim()
  if (value) return value
  const path = source[`${name}_FILE`]?.trim()
  if (!path) return undefined
  try {
    return readFile(path).trim() || undefined
  } catch {
    throw new Error(`${name}_FILE could not be read`)
  }
}

export function ntfyChannel(topicUrl: string, token?: string): Channel {
  const url = new URL(topicUrl)
  const segments = url.pathname.split("/").filter(Boolean)
  const topic = segments.pop()
  if (!topic || !/^https?:$/.test(url.protocol)) {
    throw new Error("NTFY_URL must be an http(s) topic URL")
  }
  // JSON messages are published to the server's root, which keeps titles
  // with non-ASCII characters intact (headers can't carry them).
  const root = `${url.origin}/${segments.map((s) => `${s}/`).join("")}`
  return {
    name: "ntfy",
    request: (event) => ({
      url: root,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topic: decodeURIComponent(topic),
          title: event.title,
          message: event.message,
          priority: event.kind === "down" ? 4 : 3,
          tags: [NTFY_TAGS[event.kind]],
          ...(event.url ? { click: event.url } : {}),
        }),
      },
    }),
  }
}

const NTFY_TAGS: Record<NotificationEvent["kind"], string> = {
  down: "rotating_light",
  recovered: "white_check_mark",
  warning: "warning",
}

export function webhookChannel(webhookUrl: string): Channel {
  const url = new URL(webhookUrl)
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("WEBHOOK_URL must be an http(s) URL")
  }
  return {
    name: "webhook",
    request: (event) => ({
      url: url.toString(),
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(webhookPayload(event)),
      },
    }),
  }
}

export function webhookPayload(event: NotificationEvent) {
  return {
    event: event.kind,
    monitor: event.monitor,
    status: event.status,
    warnings: event.warnings,
    since: event.since.toISOString(),
    timestamp: event.at.toISOString(),
    title: event.title,
    message: event.message,
    url: event.url ?? null,
  }
}

// The channels configured in the website's environment. A channel whose
// settings are broken is left out and reported in `errors`, without the
// secret itself.
export function resolveChannels(
  source: Source = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf-8"),
): { channels: Channel[]; errors: string[] } {
  const channels: Channel[] = []
  const errors: string[] = []
  const add = (make: () => Channel | undefined) => {
    try {
      const channel = make()
      if (channel) channels.push(channel)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  add(() => {
    const url = readSecret(source, "NTFY_URL", readFile)
    if (!url) return undefined
    const token = readSecret(source, "NTFY_TOKEN", readFile)
    try {
      return ntfyChannel(url, token)
    } catch {
      throw new Error("NTFY_URL must be an http(s) topic URL")
    }
  })
  add(() => {
    const url = readSecret(source, "WEBHOOK_URL", readFile)
    if (!url) return undefined
    try {
      return webhookChannel(url)
    } catch {
      throw new Error("WEBHOOK_URL must be an http(s) URL")
    }
  })
  return { channels, errors }
}

export type DeliveryOptions = {
  attempts?: number
  baseDelayMs?: number
  timeoutMs?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Sends one event, retrying network errors, 429s and 5xx responses with
// exponential backoff. Never throws: failures are logged (without the
// channel's URL, which may be a secret) and reported as false.
export async function deliver(
  channel: Channel,
  event: NotificationEvent,
  options: DeliveryOptions = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 4
  const baseDelayMs = options.baseDelayMs ?? 1000
  const doFetch = options.fetch ?? fetch
  const wait = options.sleep ?? sleep
  const label = `${channel.name} ${event.kind} alert for ${event.monitor.type} "${event.monitor.key}"`

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let problem: string
    let retryable = true
    try {
      const { url, init } = channel.request(event)
      const res = await doFetch(url, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      })
      if (res.ok) return true
      problem = `HTTP ${res.status}`
      retryable = res.status === 429 || res.status >= 500
    } catch (err) {
      problem = err instanceof Error ? err.name : "request failed"
    }
    if (!retryable || attempt === attempts) {
      console.error(
        `[notifications] ${label} failed after ${attempt} ${attempt === 1 ? "attempt" : "attempts"}: ${problem}`,
      )
      return false
    }
    console.warn(
      `[notifications] ${label} attempt ${attempt} failed: ${problem}; retrying`,
    )
    await wait(baseDelayMs * 2 ** (attempt - 1))
  }
  return false
}
