import type { ContainerJobTile, ContainerPingDTO } from "@mon/contracts"

import { env } from "../env"

export async function pingContainer(
  tile: ContainerJobTile,
  deps?: { fetch?: typeof globalThis.fetch; agentId?: string },
): Promise<ContainerPingDTO> {
  const pingId = crypto.randomUUID()
  const agentId = deps?.agentId ?? env.AGENT_ID
  const recordedAt = new Date().toISOString()
  const key = `container:${tile.container_name}`

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const unixSocket = tile.docker_socket?.startsWith("unix://")
      ? tile.docker_socket.slice(7)
      : null

    const url = unixSocket
      ? `http://localhost/v1.41/containers/${tile.container_name}/json`
      : `${tile.docker_socket || "unix:///var/run/docker.sock"}/v1.41/containers/${tile.container_name}/json`

    const res = await fetchFn(url)

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
