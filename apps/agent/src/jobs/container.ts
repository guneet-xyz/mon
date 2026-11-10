import type { ContainerJobTile, ContainerPingDTO } from "@mon/contracts"

import { env } from "../env"

const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock"

// Bun's fetch accepts `unix` to send the request over a Unix domain socket.
export function dockerRequest(tile: ContainerJobTile): {
  url: string
  init: RequestInit & { unix?: string }
} {
  const socket = tile.docker_socket || DEFAULT_DOCKER_SOCKET
  const path = `/v1.41/containers/${encodeURIComponent(tile.container_name)}/json`

  if (socket.startsWith("unix://") || socket.startsWith("/")) {
    return {
      url: `http://localhost${path}`,
      init: { unix: socket.replace(/^unix:\/\//, "") },
    }
  }

  const base = socket.replace(/^tcp:\/\//, "http://").replace(/\/+$/, "")
  return { url: `${base}${path}`, init: {} }
}

export async function pingContainer(
  tile: ContainerJobTile,
  deps?: { fetch?: typeof globalThis.fetch; agentId?: string },
): Promise<ContainerPingDTO> {
  const pingId = crypto.randomUUID()
  const agentId = deps?.agentId ?? env.AGENT_ID
  const recordedAt = new Date().toISOString()
  const key = tile.id

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const { url, init } = dockerRequest(tile)
    const res = await fetchFn(url, init)

    if (!res.ok) {
      return {
        kind: "container",
        ping_id: pingId,
        agent_id: agentId,
        recorded_at: recordedAt,
        key,
        error: `HTTP ${res.status}`,
      }
    }

    const json = await res.json()
    const running = json.State?.Status === "running"

    if (running) {
      return {
        kind: "container",
        ping_id: pingId,
        agent_id: agentId,
        recorded_at: recordedAt,
        key,
        error: null,
      }
    }

    return {
      kind: "container",
      ping_id: pingId,
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      error: "container is offline",
    }
  } catch (error) {
    return {
      kind: "container",
      ping_id: pingId,
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      error: String(error),
    }
  }
}
