import { describe, expect, it } from "bun:test"

import type { JobTile } from "@mon/contracts"

import { JobScheduler, type Clock } from "./scheduler"

// A clock that only moves when the test advances it.
class ManualClock implements Clock {
  private time = 0
  private nextId = 0
  private readonly timers = new Map<number, { at: number; fn: () => void }>()

  now() {
    return this.time
  }

  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++
    this.timers.set(id, { at: this.time + ms, fn })
    return id
  }

  clearTimeout(timer: unknown) {
    this.timers.delete(timer as number)
  }

  // Moves time forward a second at a time, running due timers and letting
  // the jobs they start settle.
  async advance(seconds: number) {
    for (let i = 0; i <= seconds; i++) {
      if (i > 0) this.time += 1000
      await settle()
      for (;;) {
        const due = [...this.timers].find(([, t]) => t.at <= this.time)
        if (!due) break
        this.timers.delete(due[0])
        due[1].fn()
        await settle()
      }
    }
  }
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

function host(id: string, interval_seconds?: number, address = "10.0.0.1") {
  return {
    kind: "host",
    id,
    cron: "0 * * * * *",
    address,
    ...(interval_seconds ? { interval_seconds } : {}),
  } satisfies JobTile
}

function setup(fallbackIntervalSeconds = 60) {
  const clock = new ManualClock()
  const runs: Array<{ at: number; tile: JobTile }> = []
  const scheduler = new JobScheduler({
    clock,
    fallbackIntervalSeconds,
    run: async (tile) => {
      runs.push({ at: clock.now() / 1000, tile })
    },
  })
  const runsOf = (id: string) =>
    runs.filter((run) => run.tile.id === id).map((run) => run.at)
  return { clock, scheduler, runs, runsOf }
}

describe("JobScheduler", () => {
  it("runs a new job straight away, then every interval_seconds", async () => {
    const { clock, scheduler, runsOf } = setup()
    scheduler.update([host("fast", 10), host("slow", 30)])
    await clock.advance(60)
    expect(runsOf("fast")).toEqual([0, 10, 20, 30, 40, 50, 60])
    expect(runsOf("slow")).toEqual([0, 30, 60])
  })

  it("runs jobs at their own cadence however often the agent polls", async () => {
    const { clock, scheduler, runsOf } = setup()
    for (let poll = 0; poll < 3; poll++) {
      scheduler.update([host("fast", 5), host("slow", 120)])
      await clock.advance(25)
    }
    expect(runsOf("fast")).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
    ])
    expect(runsOf("slow")).toEqual([0])
  })

  it("falls back to the poll interval for jobs without interval_seconds", async () => {
    const { clock, scheduler, runsOf } = setup(60)
    scheduler.update([host("old-website")])
    await clock.advance(150)
    expect(runsOf("old-website")).toEqual([0, 60, 120])
  })

  it("stops removed jobs and starts added ones", async () => {
    const { clock, scheduler, runsOf } = setup()
    scheduler.update([host("a", 10)])
    await clock.advance(15)
    scheduler.update([host("b", 10)])
    await clock.advance(30)
    expect(runsOf("a")).toEqual([0, 10])
    expect(runsOf("b")).toEqual([15, 25, 35, 45])
    expect(scheduler.size).toBe(1)
  })

  it("reschedules a job whose interval changes from its last run", async () => {
    const { clock, scheduler, runsOf } = setup()
    scheduler.update([host("a", 60)])
    await clock.advance(20)
    scheduler.update([host("a", 10)])
    await clock.advance(20)
    scheduler.update([host("a", 60)])
    await clock.advance(70)
    expect(runsOf("a")).toEqual([0, 20, 30, 40, 100])
  })

  it("uses a changed job's new settings without moving its schedule", async () => {
    const { clock, scheduler, runs } = setup()
    scheduler.update([host("a", 10, "10.0.0.1")])
    await clock.advance(5)
    scheduler.update([host("a", 10, "10.0.0.2")])
    await clock.advance(10)
    expect(
      runs.map((run) => [run.at, (run.tile as { address: string }).address]),
    ).toEqual([
      [0, "10.0.0.1"],
      [10, "10.0.0.2"],
    ])
  })

  it("never overlaps runs of the same job", async () => {
    const clock = new ManualClock()
    let running = 0
    let maxRunning = 0
    const starts: number[] = []
    const finishers: Array<() => void> = []
    const scheduler = new JobScheduler({
      clock,
      fallbackIntervalSeconds: 60,
      run: () => {
        starts.push(clock.now() / 1000)
        running++
        maxRunning = Math.max(maxRunning, running)
        return new Promise<void>((resolve) =>
          finishers.push(() => {
            running--
            resolve()
          }),
        )
      },
    })
    scheduler.update([host("slow", 5)])
    await clock.advance(12)
    // Removing and re-adding it while it runs does not start a second run.
    scheduler.update([])
    scheduler.update([host("slow", 5)])
    await clock.advance(1)
    expect(starts).toEqual([0])
    finishers.shift()!()
    await clock.advance(0)
    expect(starts).toEqual([0, 13])
    finishers.shift()!()
    await clock.advance(5)
    expect(starts).toEqual([0, 13, 18])
    expect(maxRunning).toBe(1)
  })

  it("keeps scheduling a job after it throws", async () => {
    const clock = new ManualClock()
    let calls = 0
    const origErr = console.error
    console.error = () => {}
    try {
      const scheduler = new JobScheduler({
        clock,
        fallbackIntervalSeconds: 60,
        run: async () => {
          calls++
          throw new Error("boom")
        },
      })
      scheduler.update([host("a", 10)])
      await clock.advance(20)
      expect(calls).toBe(3)
    } finally {
      console.error = origErr
    }
  })

  it("runs every tile that shares a key", async () => {
    const { clock, scheduler, runs } = setup()
    scheduler.update([
      host("same", 10, "10.0.0.1"),
      host("same", 10, "10.0.0.2"),
      { kind: "website", id: "same", cron: "", url: "https://x" },
    ])
    await clock.advance(0)
    expect(runs).toHaveLength(3)
    expect(scheduler.size).toBe(3)
  })

  it("stop() cancels every job", async () => {
    const { clock, scheduler, runsOf } = setup()
    scheduler.update([host("a", 10)])
    await clock.advance(5)
    scheduler.stop()
    await clock.advance(60)
    expect(runsOf("a")).toEqual([0])
    expect(scheduler.size).toBe(0)
  })
})
