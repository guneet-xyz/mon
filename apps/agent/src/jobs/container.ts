import type { ContainerJobTile, ContainerPingDTO } from "@mon/contracts"

import { env } from "../env"

const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock"

// Bun's fetch accepts `unix` to send the request over a Unix domain socket.
export function dockerRequest(
  tile: ContainerJobTile,
  endpoint = "json",
): {
  url: string
  init: RequestInit & { unix?: string }
} {
  const socket = tile.docker_socket || DEFAULT_DOCKER_SOCKET
  const path = `/v1.41/containers/${encodeURIComponent(tile.container_name)}/${endpoint}`

  if (socket.startsWith("unix://") || socket.startsWith("/")) {
    return {
      url: `http://localhost${path}`,
      init: { unix: socket.replace(/^unix:\/\//, "") },
    }
  }

  const base = socket.replace(/^tcp:\/\//, "http://").replace(/\/+$/, "")
  return { url: `${base}${path}`, init: {} }
}

type Details = Omit<
  ContainerPingDTO,
  "kind" | "ping_id" | "agent_id" | "recorded_at" | "key" | "error"
>

type CpuSample = { container: number; system: number }

// One-shot stats carry a single CPU sample, so CPU % is computed against the
// previous poll's sample for the same tile, as `docker stats` does between
// its own two samples.
const previousCpu = new Map<string, CpuSample>()

export function cpuPercent(
  previous: CpuSample | undefined,
  current: CpuSample,
  cpus: number,
): number | null {
  if (!previous) return null
  const container = current.container - previous.container
  const system = current.system - previous.system
  // A restarted container resets its counter; skip that sample.
  if (system <= 0 || container < 0) return null
  return (container / system) * cpus * 100
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const date = new Date(value)
  // Docker reports never-started containers as 0001-01-01T00:00:00Z.
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return null
  return date.toISOString()
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, max)
    : null
}

function inspectDetails(json: any): Details {
  const state = json?.State ?? {}
  return {
    state: stringOrNull(state.Status, 16),
    health: stringOrNull(state.Health?.Status, 16),
    restart_count: numberOrNull(json?.RestartCount),
    started_at: isoOrNull(state.StartedAt),
    exit_code: numberOrNull(state.ExitCode),
    oom_killed: typeof state.OOMKilled === "boolean" ? state.OOMKilled : null,
    image: stringOrNull(json?.Config?.Image, 256),
    image_version: stringOrNull(
      json?.Config?.Labels?.["org.opencontainers.image.version"],
      64,
    ),
  }
}

async function readStats(
  tile: ContainerJobTile,
  fetchFn: typeof globalThis.fetch,
): Promise<
  Pick<Details, "cpu_percent" | "memory_bytes" | "memory_limit_bytes">
> {
  const none = {
    cpu_percent: null,
    memory_bytes: null,
    memory_limit_bytes: null,
  }
  try {
    const { url, init } = dockerRequest(
      tile,
      "stats?stream=false&one-shot=true",
    )
    const res = await fetchFn(url, init)
    if (!res.ok) return none
    const stats: any = await res.json()

    const cpu = stats?.cpu_stats
    const total = numberOrNull(cpu?.cpu_usage?.total_usage)
    const system = numberOrNull(cpu?.system_cpu_usage)
    let cpu_percent: number | null = null
    if (total !== null && system !== null) {
      const sample = { container: total, system }
      const cpus =
        numberOrNull(cpu?.online_cpus) ??
        (Array.isArray(cpu?.cpu_usage?.percpu_usage)
          ? cpu.cpu_usage.percpu_usage.length
          : 1)
      cpu_percent = cpuPercent(previousCpu.get(tile.id), sample, cpus)
      previousCpu.set(tile.id, sample)
    }

    // "Used" memory as `docker stats` reports it: usage minus page cache that
    // can be reclaimed (inactive_file on cgroup v2, cache on v1).
    const memory = stats?.memory_stats
    const usage = numberOrNull(memory?.usage)
    const reclaimable =
      numberOrNull(memory?.stats?.inactive_file) ??
      numberOrNull(memory?.stats?.total_inactive_file) ??
      numberOrNull(memory?.stats?.cache) ??
      0
    return {
      cpu_percent,
      memory_bytes: usage === null ? null : Math.max(0, usage - reclaimable),
      memory_limit_bytes: numberOrNull(memory?.limit),
    }
  } catch {
    return none
  }
}

export async function pingContainer(
  tile: ContainerJobTile,
  deps?: { fetch?: typeof globalThis.fetch; agentId?: string },
): Promise<ContainerPingDTO> {
  const base = {
    kind: "container" as const,
    ping_id: crypto.randomUUID(),
    agent_id: deps?.agentId ?? env.AGENT_ID,
    recorded_at: new Date().toISOString(),
    key: tile.id,
  }

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const { url, init } = dockerRequest(tile)
    const res = await fetchFn(url, init)

    if (!res.ok) {
      return { ...base, error: `HTTP ${res.status}` }
    }

    const details = inspectDetails(await res.json())
    if (details.state !== "running") {
      previousCpu.delete(tile.id)
      return { ...base, ...details, error: "container is offline" }
    }

    return {
      ...base,
      ...details,
      ...(await readStats(tile, fetchFn)),
      error: null,
    }
  } catch (error) {
    return { ...base, error: String(error).slice(0, 256) }
  }
}
