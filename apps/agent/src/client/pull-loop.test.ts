import type { JobTile, JobsResponse } from "@mon/contracts"

import { UnauthorizedError, UnreachableError } from "./api-client"
import { startPullLoop } from "./pull-loop"

import { describe, expect, it, mock } from "bun:test"

interface FakeClientOptions {
  responses: Array<JobsResponse | Error>
}

function makeFakeClient(opts: FakeClientOptions) {
  let i = 0
  const getJobs = mock(async () => {
    const r = opts.responses[Math.min(i, opts.responses.length - 1)]
    i++
    if (r instanceof Error) throw r
    return r
  })
  return { getJobs } as unknown as import("./api-client").WebsiteApiClient & {
    getJobs: typeof getJobs
  }
}

describe("startPullLoop", () => {
  it("calls exit(78) on UnauthorizedError", async () => {
    const client = makeFakeClient({ responses: [new UnauthorizedError()] })
    const onJobsUpdated = mock((_tiles: JobTile[]) => {})
    const exit = mock((_code: number) => {})
    await startPullLoop({
      client,
      intervalSeconds: 0,
      onJobsUpdated,
      exit: exit as unknown as (code: number) => never,
    })
    expect(exit).toHaveBeenCalledWith(78)
    expect(onJobsUpdated).not.toHaveBeenCalled()
  })

  it("backs off on UnreachableError and logs", async () => {
    const client = makeFakeClient({
      responses: [
        new UnreachableError("first"),
        new UnreachableError("second"),
      ],
    })
    const onJobsUpdated = mock((_tiles: JobTile[]) => {})
    const errors: unknown[][] = []
    const origErr = console.error
    console.error = ((...args: unknown[]) => {
      errors.push(args)
    }) as unknown as typeof console.error
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 30)
    try {
      await startPullLoop({
        client,
        intervalSeconds: 0,
        onJobsUpdated,
        signal: abort.signal,
        exit: (() => {}) as unknown as (code: number) => never,
      })
    } finally {
      console.error = origErr
    }
    expect(client.getJobs.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(onJobsUpdated).not.toHaveBeenCalled()
    expect(
      errors.some((args) =>
        String(args[0]).includes("Website unreachable, backing off"),
      ),
    ).toBe(true)
  })

  it("logs warning on empty job list but continues", async () => {
    const client = makeFakeClient({ responses: [{ tiles: [] }] })
    const onJobsUpdated = mock((_tiles: JobTile[]) => {})
    const warn = mock((..._args: unknown[]) => {})
    const origWarn = console.warn
    console.warn = warn as unknown as typeof console.warn
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 10)
    try {
      await startPullLoop({
        client,
        intervalSeconds: 10, // long, but abort short-circuits
        onJobsUpdated,
        signal: abort.signal,
        exit: (() => {}) as unknown as (code: number) => never,
      })
    } finally {
      console.warn = origWarn
    }
    expect(warn).toHaveBeenCalled()
    expect(onJobsUpdated).toHaveBeenCalledWith([])
  })

  it("stops cleanly when signal is aborted", async () => {
    const tile: JobTile = {
      kind: "host",
      id: "h1",
      cron: "* * * * * *",
      address: "1.1.1.1",
    }
    const client = makeFakeClient({
      responses: [{ tiles: [tile] }, { tiles: [tile] }, { tiles: [tile] }],
    })
    const onJobsUpdated = mock((_tiles: JobTile[]) => {})
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 20)
    const start = Date.now()
    await startPullLoop({
      client,
      intervalSeconds: 100, // would otherwise sleep forever
      onJobsUpdated,
      signal: abort.signal,
      exit: (() => {}) as unknown as (code: number) => never,
    })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
    expect(onJobsUpdated).toHaveBeenCalled()
  })
})
