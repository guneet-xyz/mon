import { describe, expect, mock, test } from "bun:test"

import type { Channel } from "./channels"
import { startNotificationLoop } from "./loop"

describe("startNotificationLoop", () => {
  test("does not start without a channel", () => {
    const run = mock(async (_channels: Channel[]) => undefined)
    expect(startNotificationLoop({}, { run })).toBeNull()
    expect(
      startNotificationLoop({ NTFY_URL: "", WEBHOOK_URL: "" }, { run }),
    ).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  test("evaluates right away, then on the interval, and starts only once", async () => {
    const log = console.log
    console.log = () => undefined
    const run = mock(async (_channels: Channel[]) => undefined)
    try {
      const loop = startNotificationLoop(
        { WEBHOOK_URL: "https://hooks.example.com/x" },
        { run, intervalMs: 10 },
      )
      expect(loop).not.toBeNull()
      expect(
        startNotificationLoop({ WEBHOOK_URL: "https://hooks.example.com/y" }),
      ).toBe(loop)
      for (let i = 0; i < 200 && run.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      loop?.stop()
      const calls = run.mock.calls.length
      expect(calls).toBeGreaterThanOrEqual(2)
      expect(run.mock.calls[0]![0].map((channel) => channel.name)).toEqual([
        "webhook",
      ])
      await new Promise((resolve) => setTimeout(resolve, 30))
      expect(run.mock.calls.length).toBe(calls)
    } finally {
      console.log = log
    }
  })
})
