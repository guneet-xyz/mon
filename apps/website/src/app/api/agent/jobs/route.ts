import { getAgentAssignments, monitorIntervalSeconds } from "@mon/config/schema"
import { JobsResponseSchema, type JobTile } from "@mon/contracts"

import { verifyBearerToken } from "@/lib/server/agent-auth"
import { getCachedConfig } from "@/lib/server/config-cache"

// Agents schedule jobs from interval_seconds. The cron string is only there
// because older agents require the field; they never read it.
function deriveCron(seconds: number): string {
  if (seconds < 60) return `*/${seconds} * * * * *`
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `0 */${minutes} * * * *`
}

export async function GET(request: Request): Promise<Response> {
  const config = await getCachedConfig()
  const auth = verifyBearerToken(request, config)

  if ("error" in auth) {
    return new Response(null, { status: 401 })
  }

  const tiles = getAgentAssignments(config, auth.agentId)

  const jobTiles: JobTile[] = tiles.map((tile) => {
    const interval_seconds = monitorIntervalSeconds(config, tile)
    const cron = deriveCron(interval_seconds)
    switch (tile.type) {
      case "host":
        return {
          kind: "host",
          id: tile.key,
          cron,
          interval_seconds,
          address: tile.address,
        }
      case "website":
        return {
          kind: "website",
          id: tile.key,
          cron,
          interval_seconds,
          url: tile.url,
          method: tile.method,
        }
      case "container":
        return {
          kind: "container",
          id: tile.key,
          cron,
          interval_seconds,
          container_name: tile.container_name,
          ...(tile.docker_socket ? { docker_socket: tile.docker_socket } : {}),
        }
      case "github":
        return {
          kind: "github",
          id: tile.key,
          cron,
          interval_seconds,
          repo: tile.repo,
          ...(tile.github_token ? { github_token: tile.github_token } : {}),
        }
      case "agent":
        return {
          kind: "system",
          id: tile.key,
          cron,
          interval_seconds,
          disks: tile.disks,
        }
    }
  })

  return Response.json(JobsResponseSchema.parse({ tiles: jobTiles }))
}
