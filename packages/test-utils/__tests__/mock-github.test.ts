import { type MockServer, createMockGithubServer } from "../index"

import { afterEach, describe, expect, it } from "bun:test"

describe("createMockGithubServer", () => {
  let server: MockServer | undefined

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it("success scenario returns the configured check_runs", async () => {
    server = await createMockGithubServer()
    server.setScenario({
      kind: "success",
      checkRuns: [
        {
          id: 1,
          name: "build",
          status: "completed",
          conclusion: "success",
          details_url: "https://example.com/1",
          started_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T00:05:00Z",
          head_sha: "abc123",
        },
      ],
    })

    const resp = await fetch(
      `${server.url}/repos/owner/repo/commits/HEAD/check-runs`,
    )
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { check_runs: Array<{ id: number }> }
    expect(body.check_runs).toHaveLength(1)
    expect(body.check_runs[0]!.id).toBe(1)
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0]!.method).toBe("GET")
    expect(server.requests[0]!.path).toBe(
      "/repos/owner/repo/commits/HEAD/check-runs",
    )
  })

  it("empty scenario returns an empty check_runs array", async () => {
    server = await createMockGithubServer()
    server.setScenario({ kind: "empty" })

    const resp = await fetch(
      `${server.url}/repos/owner/repo/commits/HEAD/check-runs`,
    )
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as { check_runs: unknown[] }
    expect(body.check_runs).toEqual([])
  })

  it("http_error scenario returns the configured status", async () => {
    server = await createMockGithubServer()
    server.setScenario({ kind: "http_error", status: 503 })

    const resp = await fetch(
      `${server.url}/repos/owner/repo/commits/HEAD/check-runs`,
    )
    expect(resp.status).toBe(503)
  })

  it("slow scenario delays the response by delayMs", async () => {
    server = await createMockGithubServer()
    server.setScenario({ kind: "slow", delayMs: 200 })

    const start = Date.now()
    const resp = await fetch(
      `${server.url}/repos/owner/repo/commits/HEAD/check-runs`,
    )
    const elapsed = Date.now() - start
    expect(resp.status).toBe(200)
    expect(elapsed).toBeGreaterThanOrEqual(190)
  })

  it("malformed scenario returns invalid JSON", async () => {
    server = await createMockGithubServer()
    server.setScenario({ kind: "malformed" })

    const resp = await fetch(
      `${server.url}/repos/owner/repo/commits/HEAD/check-runs`,
    )
    expect(resp.status).toBe(200)
    let parseFailed = false
    try {
      await resp.json()
    } catch {
      parseFailed = true
    }
    expect(parseFailed).toBe(true)
  })
})
