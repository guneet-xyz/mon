import { afterEach, describe, expect, mock, test } from "bun:test"

import {
  deliver,
  ntfyChannel,
  resolveChannels,
  webhookChannel,
  webhookPayload,
} from "./channels"
import type { NotificationEvent } from "./rules"

const event: NotificationEvent = {
  kind: "down",
  monitor: { type: "host", key: "router", name: "Router" },
  status: "offline",
  warnings: [],
  since: new Date("2026-11-21T12:00:00.000Z"),
  at: new Date("2026-11-21T12:01:00.000Z"),
  title: "Router is down",
  message: "Host Router is down (since 2026-11-21T12:00:00Z).",
  url: "https://mon.example.com",
}

const { error: consoleError, warn: consoleWarn } = console
afterEach(() => {
  console.error = consoleError
  console.warn = consoleWarn
})

const quiet = () => {
  const error = mock(() => undefined)
  const warn = mock(() => undefined)
  console.error = error
  console.warn = warn
  return { error, warn }
}

describe("resolveChannels", () => {
  test("no variables, no channels", () => {
    expect(resolveChannels({})).toEqual({ channels: [], errors: [] })
  })

  test("reads values and files, values first", () => {
    const files: Record<string, string> = {
      "/run/secrets/ntfy_token": "tk_file\n",
      "/run/secrets/webhook": " https://hooks.example.com/x \n",
    }
    const read = (path: string) => {
      const value = files[path]
      if (value === undefined) throw new Error("ENOENT")
      return value
    }
    const { channels, errors } = resolveChannels(
      {
        NTFY_URL: "https://ntfy.example.com/alerts",
        NTFY_TOKEN_FILE: "/run/secrets/ntfy_token",
        WEBHOOK_URL: "",
        WEBHOOK_URL_FILE: "/run/secrets/webhook",
      },
      read,
    )
    expect(errors).toEqual([])
    expect(channels.map((c) => c.name)).toEqual(["ntfy", "webhook"])
    const ntfy = channels[0]!.request(event)
    expect(ntfy.init.headers).toMatchObject({ authorization: "Bearer tk_file" })
    expect(channels[1]!.request(event).url).toBe("https://hooks.example.com/x")
  })

  test("reports broken settings without the secret", () => {
    const { channels, errors } = resolveChannels(
      { NTFY_URL: "not a url secret", WEBHOOK_URL_FILE: "/missing" },
      () => {
        throw new Error("ENOENT")
      },
    )
    expect(channels).toEqual([])
    expect(errors).toEqual([
      "NTFY_URL must be an http(s) topic URL",
      "WEBHOOK_URL_FILE could not be read",
    ])
  })
})

describe("ntfyChannel", () => {
  test("publishes JSON to the server root with the topic", () => {
    const { url, init } = ntfyChannel(
      "https://ntfy.example.com/mon-alerts",
      "tk",
    ).request(event)
    expect(url).toBe("https://ntfy.example.com/")
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer tk",
    })
    expect(JSON.parse(init.body as string)).toEqual({
      topic: "mon-alerts",
      title: "Router is down",
      message: "Host Router is down (since 2026-11-21T12:00:00Z).",
      priority: 4,
      tags: ["rotating_light"],
      click: "https://mon.example.com",
    })
  })

  test("keeps a server's base path and leaves out unset fields", () => {
    const { url, init } = ntfyChannel("https://example.com/ntfy/topic").request(
      {
        ...event,
        kind: "recovered",
        url: undefined,
      },
    )
    expect(url).toBe("https://example.com/ntfy/")
    expect(init.headers).not.toHaveProperty("authorization")
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).not.toHaveProperty("click")
    expect(body.priority).toBe(3)
  })

  test("needs a topic", () => {
    expect(() => ntfyChannel("https://ntfy.example.com/")).toThrow()
  })
})

describe("webhookChannel", () => {
  test("posts the event as JSON", () => {
    const { url, init } = webhookChannel(
      "https://hooks.example.com/mon",
    ).request(event)
    expect(url).toBe("https://hooks.example.com/mon")
    expect(JSON.parse(init.body as string)).toEqual({
      event: "down",
      monitor: { type: "host", key: "router", name: "Router" },
      status: "offline",
      warnings: [],
      since: "2026-11-21T12:00:00.000Z",
      timestamp: "2026-11-21T12:01:00.000Z",
      title: "Router is down",
      message: "Host Router is down (since 2026-11-21T12:00:00Z).",
      url: "https://mon.example.com",
    })
    expect(webhookPayload({ ...event, url: undefined }).url).toBeNull()
  })
})

describe("deliver", () => {
  const channel = webhookChannel("https://secret.example.com/hook-token")
  const sleep = mock(async (_ms: number) => undefined)

  test("retries 5xx and network errors with backoff", async () => {
    const logs = quiet()
    sleep.mockClear()
    const responses = [
      () => Promise.reject(new TypeError("fetch failed")),
      () => Promise.resolve(new Response(null, { status: 502 })),
      () => Promise.resolve(new Response(null, { status: 200 })),
    ]
    let call = 0
    const ok = await deliver(channel, event, {
      fetch: (() => responses[call++]!()) as unknown as typeof fetch,
      sleep,
      baseDelayMs: 100,
    })
    expect(ok).toBe(true)
    expect(call).toBe(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200])
    expect(logs.warn).toHaveBeenCalledTimes(2)
    expect(logs.error).not.toHaveBeenCalled()
  })

  test("gives up after the last attempt, logs without the URL", async () => {
    const logs = quiet()
    let call = 0
    const ok = await deliver(channel, event, {
      fetch: (() => {
        call++
        return Promise.resolve(new Response(null, { status: 503 }))
      }) as unknown as typeof fetch,
      sleep,
      attempts: 3,
    })
    expect(ok).toBe(false)
    expect(call).toBe(3)
    expect(logs.error).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify([
      ...logs.warn.mock.calls,
      ...logs.error.mock.calls,
    ])
    expect(logged).toContain("HTTP 503")
    expect(logged).not.toContain("hook-token")
  })

  test("does not retry other 4xx responses", async () => {
    quiet()
    let call = 0
    const ok = await deliver(channel, event, {
      fetch: (() => {
        call++
        return Promise.resolve(new Response(null, { status: 403 }))
      }) as unknown as typeof fetch,
      sleep,
    })
    expect(ok).toBe(false)
    expect(call).toBe(1)
  })
})
