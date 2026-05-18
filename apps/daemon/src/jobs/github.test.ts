import { describe, it, expect, beforeEach, mock } from "bun:test"
import { pingGithub } from "./github"
import type { GithubJobTile } from "@mon/contracts"

describe("pingGithub", () => {
  let mockFetch: any
  let tile: GithubJobTile

  beforeEach(() => {
    tile = {
      kind: "github",
      id: "test-github",
      cron: "0 * * * * *",
      repo: "owner/repo",
      github_token: "ghp_test123",
    }
  })

  it("returns ping with error=null and checkRuns when check runs exist", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        check_runs: [
          {
            id: 123456,
            name: "test-run",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/owner/repo/runs/123456",
            started_at: new Date("2026-05-18T10:00:00Z"),
            completed_at: new Date("2026-05-18T10:05:00Z"),
            head_sha: "abc123def456",
          },
        ],
      }),
    }))

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toBeNull()
    expect(result.ping.commit_hash).toBe("abc123def456")
    expect(result.ping.check_run_id).toBe(123456)
    expect(result.checkRuns).toHaveLength(1)
    expect(result.checkRuns[0]!.kind).toBe("github_check_run")
    expect(result.checkRuns[0]!.id).toBe(123456)
    expect(result.checkRuns[0]!.name).toBe("test-run")
  })

  it("returns ping with error='no check runs' when response is empty", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        check_runs: [],
      }),
    }))

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toBe("no check runs")
    expect(result.ping.commit_hash).toBeNull()
    expect(result.ping.check_run_id).toBeNull()
    expect(result.checkRuns).toHaveLength(0)
  })

  it("returns ping with error on API failure", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }))

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toContain("401")
    expect(result.ping.commit_hash).toBeNull()
    expect(result.ping.check_run_id).toBeNull()
    expect(result.checkRuns).toHaveLength(0)
  })

  it("returns ping with error on network failure", async () => {
    mockFetch = mock(async () => {
      throw new Error("network error")
    })

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toContain("network error")
    expect(result.ping.commit_hash).toBeNull()
    expect(result.ping.check_run_id).toBeNull()
    expect(result.checkRuns).toHaveLength(0)
  })

  it("returns ping with error on JSON parse failure", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid json")
      },
    }))

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toContain("invalid json")
    expect(result.ping.commit_hash).toBeNull()
    expect(result.ping.check_run_id).toBeNull()
    expect(result.checkRuns).toHaveLength(0)
  })

  it("returns ping with error when multiple commit hashes found", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        check_runs: [
          {
            id: 123456,
            name: "run1",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/owner/repo/runs/123456",
            started_at: new Date("2026-05-18T10:00:00Z"),
            completed_at: new Date("2026-05-18T10:05:00Z"),
            head_sha: "abc123",
          },
          {
            id: 123457,
            name: "run2",
            status: "completed",
            conclusion: "success",
            details_url: "https://github.com/owner/repo/runs/123457",
            started_at: new Date("2026-05-18T10:00:00Z"),
            completed_at: new Date("2026-05-18T10:05:00Z"),
            head_sha: "def456",
          },
        ],
      }),
    }))

    const result = await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(result.ping.kind).toBe("github_ping")
    expect(result.ping.error).toContain("multiple commit hashes")
    expect(result.ping.commit_hash).toBeNull()
    expect(result.ping.check_run_id).toBeNull()
    expect(result.checkRuns).toHaveLength(0)
  })

  it("uses tile.github_token when provided", async () => {
    const fetchCalls: any[] = []
    mockFetch = mock(async (url: string, options: any) => {
      fetchCalls.push({ url, options })
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            {
              id: 123456,
              name: "test-run",
              status: "completed",
              conclusion: "success",
              details_url: "https://github.com/owner/repo/runs/123456",
              started_at: new Date("2026-05-18T10:00:00Z"),
              completed_at: new Date("2026-05-18T10:05:00Z"),
              head_sha: "abc123",
            },
          ],
        }),
      }
    })

    await pingGithub(tile, { fetch: mockFetch, daemonId: "test-daemon" })

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]!.options.headers.Authorization).toBe("Bearer ghp_test123")
  })
})
