import type { JobTile } from "@mon/contracts"

export interface Clock {
  now(): number
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(timer: unknown): void
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export interface JobSchedulerOptions {
  run: (tile: JobTile) => Promise<void>
  // For jobs from websites that don't send interval_seconds: they ran once per
  // poll before agents scheduled jobs themselves.
  fallbackIntervalSeconds: number
  clock?: Clock
}

interface ScheduledJob {
  tile: JobTile
  intervalMs: number
  lastStartedAt: number | null
  running: boolean
  removed: boolean
  timer: unknown
}

// Runs each job every interval_seconds, independently of how often the agent
// polls for its job list. A new job runs straight away. A job's runs never
// overlap: one that takes longer than its interval starts again as soon as it
// finishes.
export class JobScheduler {
  private readonly jobs = new Map<string, ScheduledJob>()
  private readonly clock: Clock

  constructor(private readonly opts: JobSchedulerOptions) {
    this.clock = opts.clock ?? systemClock
  }

  // Replace the job list. Unchanged jobs keep their schedule, changed ones run
  // with their new settings from their next run (sooner or later if their
  // interval changed), and removed ones stop.
  update(tiles: JobTile[]): void {
    const seen = new Set<string>()
    for (const [id, tile] of withIds(tiles)) {
      seen.add(id)
      const intervalMs = this.intervalMs(tile)
      const job = this.jobs.get(id)
      if (!job) {
        const created: ScheduledJob = {
          tile,
          intervalMs,
          lastStartedAt: null,
          running: false,
          removed: false,
          timer: null,
        }
        this.jobs.set(id, created)
        this.schedule(id, created)
        continue
      }
      job.tile = tile
      job.removed = false
      if (job.intervalMs !== intervalMs) {
        job.intervalMs = intervalMs
        if (!job.running) this.schedule(id, job)
      }
    }
    for (const [id, job] of this.jobs) {
      if (!seen.has(id)) this.remove(id, job)
    }
  }

  stop(): void {
    for (const [id, job] of this.jobs) this.remove(id, job)
  }

  // How many jobs are scheduled.
  get size(): number {
    return [...this.jobs.values()].filter((job) => !job.removed).length
  }

  private intervalMs(tile: JobTile): number {
    const seconds = tile.interval_seconds ?? this.opts.fallbackIntervalSeconds
    return Math.max(1, seconds) * 1000
  }

  private schedule(id: string, job: ScheduledJob): void {
    if (job.timer) this.clock.clearTimeout(job.timer)
    const now = this.clock.now()
    const due =
      job.lastStartedAt === null ? now : job.lastStartedAt + job.intervalMs
    job.timer = this.clock.setTimeout(
      () => void this.fire(id, job),
      Math.max(0, due - now),
    )
  }

  private async fire(id: string, job: ScheduledJob): Promise<void> {
    job.timer = null
    if (job.removed || job.running) return
    job.running = true
    job.lastStartedAt = this.clock.now()
    try {
      await this.opts.run(job.tile)
    } catch (e) {
      console.error(`[agent] Unhandled error in job ${id}:`, e)
    } finally {
      job.running = false
      if (job.removed) this.jobs.delete(id)
      else this.schedule(id, job)
    }
  }

  // A running job finishes first, so it can't overlap with itself if it is
  // added back straight away.
  private remove(id: string, job: ScheduledJob): void {
    if (job.timer) this.clock.clearTimeout(job.timer)
    job.timer = null
    job.removed = true
    if (!job.running) this.jobs.delete(id)
  }
}

// A job is identified by its kind and key. Tiles may share a key, so repeats
// get a numbered suffix and still run.
function withIds(tiles: JobTile[]): Array<[string, JobTile]> {
  const counts = new Map<string, number>()
  return tiles.map((tile) => {
    const base = `${tile.kind}:${tile.id}`
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    return [count === 0 ? base : `${base}#${count}`, tile]
  })
}
