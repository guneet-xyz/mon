import type { JobTile } from "@mon/contracts"

import type { WebsiteApiClient } from "./api-client"
import { UnauthorizedError, UnreachableError } from "./api-client"

export interface PullLoopOptions {
  client: WebsiteApiClient
  intervalSeconds: number
  onJobsUpdated: (tiles: JobTile[]) => void
  signal?: AbortSignal
  exit?: (code: number) => void
}

const INITIAL_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 300_000

export async function startPullLoop(opts: PullLoopOptions): Promise<void> {
  const {
    client,
    intervalSeconds,
    onJobsUpdated,
    signal,
    exit = process.exit.bind(process),
  } = opts
  let backoffMs = INITIAL_BACKOFF_MS

  while (!signal?.aborted) {
    try {
      const jobs = await client.getJobs()
      backoffMs = INITIAL_BACKOFF_MS
      if (jobs.tiles.length === 0) {
        console.warn(
          "[daemon] No jobs assigned to this daemon — polling again in",
          intervalSeconds,
          "s",
        )
      }
      onJobsUpdated(jobs.tiles)
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        console.error("[daemon] 401 Unauthorized — exiting with code 78")
        exit(78)
        return
      }
      if (e instanceof UnreachableError) {
        console.error(
          "[daemon] Website unreachable, backing off",
          backoffMs,
          "ms",
        )
        await sleep(backoffMs, signal)
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
        continue
      }
      throw e
    }
    await sleep(intervalSeconds * 1000, signal)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}
