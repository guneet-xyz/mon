import type {
  ContainerJobTile,
  ContainerPingDTO,
  GithubCheckRunDTO,
  GithubJobTile,
  GithubPingDTO,
  HostJobTile,
  HostPingDTO,
  WebsiteJobTile,
  WebsitePingDTO,
} from "@mon/contracts"

import { describe, expect, it, mock } from "bun:test"

const hostDto: HostPingDTO = {
  kind: "host",
  ping_id: "00000000-0000-0000-0000-000000000001",
  agent_id: "agent-test",
  recorded_at: "2024-01-01T00:00:00.000Z",
  key: "host:1.1.1.1",
  latency_ms: 12,
  error: null,
}

const websiteDto: WebsitePingDTO = {
  kind: "website",
  ping_id: "00000000-0000-0000-0000-000000000002",
  agent_id: "agent-test",
  recorded_at: "2024-01-01T00:00:00.000Z",
  key: "website:https://example.com",
  latency_ms: 50,
  error: null,
}

const containerDto: ContainerPingDTO = {
  kind: "container",
  ping_id: "00000000-0000-0000-0000-000000000003",
  agent_id: "agent-test",
  recorded_at: "2024-01-01T00:00:00.000Z",
  key: "container:nginx",
  error: null,
}

const githubPing: GithubPingDTO = {
  kind: "github_ping",
  ping_id: "00000000-0000-0000-0000-000000000004",
  agent_id: "agent-test",
  recorded_at: "2024-01-01T00:00:00.000Z",
  key: "github:owner/repo",
  commit_hash: "abc123",
  check_run_id: null,
  error: null,
}

const githubCheckRun: GithubCheckRunDTO = {
  kind: "github_check_run",
  ping_id: "00000000-0000-0000-0000-000000000005",
  agent_id: "agent-test",
  recorded_at: "2024-01-01T00:00:00.000Z",
  key: "github:owner/repo:check:1",
  id: 1,
  name: "ci",
  status: "completed",
  conclusion: "success",
  details_url: "https://example.com",
  started_at: "2024-01-01T00:00:00.000Z",
  completed_at: "2024-01-01T00:01:00.000Z",
}

const pingHost = mock(async (_tile: HostJobTile) => hostDto)
const pingWebsite = mock(async (_tile: WebsiteJobTile) => websiteDto)
const pingContainer = mock(async (_tile: ContainerJobTile) => containerDto)
const pingGithub = mock(async (_tile: GithubJobTile) => ({
  ping: githubPing,
  checkRuns: [githubCheckRun] as GithubCheckRunDTO[],
}))

mock.module("./jobs/host", () => ({ pingHost }))
mock.module("./jobs/website", () => ({ pingWebsite }))
mock.module("./jobs/container", () => ({ pingContainer }))
mock.module("./jobs/github", () => ({ pingGithub }))

process.env.SKIP_ENV_VALIDATION = "1"

const { executeJob } = await import("./index")

function makeClient() {
  return {
    pushHostPing: mock(async (_dto: HostPingDTO) => ({ success: true })),
    pushWebsitePing: mock(async (_dto: WebsitePingDTO) => ({ success: true })),
    pushContainerPing: mock(async (_dto: ContainerPingDTO) => ({
      success: true,
    })),
    pushGithubPing: mock(async (_dto: GithubPingDTO | GithubCheckRunDTO) => ({
      success: true,
    })),
  } as unknown as import("./client/api-client").WebsiteApiClient & {
    pushHostPing: ReturnType<typeof mock>
    pushWebsitePing: ReturnType<typeof mock>
    pushContainerPing: ReturnType<typeof mock>
    pushGithubPing: ReturnType<typeof mock>
  }
}

describe("executeJob", () => {
  it("host tile → pingHost + pushHostPing", async () => {
    pingHost.mockClear()
    const client = makeClient()
    const tile: HostJobTile = {
      kind: "host",
      id: "h1",
      cron: "* * * * * *",
      address: "1.1.1.1",
    }
    await executeJob(tile, client)
    expect(pingHost).toHaveBeenCalledTimes(1)
    expect(pingHost).toHaveBeenCalledWith(tile)
    expect(client.pushHostPing).toHaveBeenCalledTimes(1)
    expect(client.pushHostPing).toHaveBeenCalledWith(hostDto)
  })

  it("website tile → pingWebsite + pushWebsitePing", async () => {
    pingWebsite.mockClear()
    const client = makeClient()
    const tile: WebsiteJobTile = {
      kind: "website",
      id: "w1",
      cron: "* * * * * *",
      url: "https://example.com",
    }
    await executeJob(tile, client)
    expect(pingWebsite).toHaveBeenCalledTimes(1)
    expect(pingWebsite).toHaveBeenCalledWith(tile)
    expect(client.pushWebsitePing).toHaveBeenCalledTimes(1)
    expect(client.pushWebsitePing).toHaveBeenCalledWith(websiteDto)
  })

  it("container tile → pingContainer + pushContainerPing", async () => {
    pingContainer.mockClear()
    const client = makeClient()
    const tile: ContainerJobTile = {
      kind: "container",
      id: "c1",
      cron: "* * * * * *",
      container_name: "nginx",
    }
    await executeJob(tile, client)
    expect(pingContainer).toHaveBeenCalledTimes(1)
    expect(pingContainer).toHaveBeenCalledWith(tile)
    expect(client.pushContainerPing).toHaveBeenCalledTimes(1)
    expect(client.pushContainerPing).toHaveBeenCalledWith(containerDto)
  })

  it("github tile → pingGithub + pushGithubPing for ping and each check run", async () => {
    pingGithub.mockClear()
    const client = makeClient()
    const tile: GithubJobTile = {
      kind: "github",
      id: "g1",
      cron: "* * * * * *",
      repo: "owner/repo",
    }
    await executeJob(tile, client)
    expect(pingGithub).toHaveBeenCalledTimes(1)
    expect(pingGithub).toHaveBeenCalledWith(tile)
    expect(client.pushGithubPing).toHaveBeenCalledTimes(2)
    expect(client.pushGithubPing).toHaveBeenNthCalledWith(1, githubPing)
    expect(client.pushGithubPing).toHaveBeenNthCalledWith(2, githubCheckRun)
  })

  it("swallows ping errors (logs, never throws)", async () => {
    pingHost.mockClear()
    pingHost.mockImplementationOnce(async () => {
      throw new Error("boom")
    })
    const client = makeClient()
    const errors: unknown[][] = []
    const origErr = console.error
    console.error = ((...args: unknown[]) => {
      errors.push(args)
    }) as unknown as typeof console.error
    try {
      const tile: HostJobTile = {
        kind: "host",
        id: "h-err",
        cron: "* * * * * *",
        address: "1.1.1.1",
      }
      await expect(executeJob(tile, client)).resolves.toBeUndefined()
      expect(client.pushHostPing).not.toHaveBeenCalled()
      expect(
        errors.some((args) =>
          String(args[0]).includes("Error executing job h-err"),
        ),
      ).toBe(true)
    } finally {
      console.error = origErr
    }
  })
})
