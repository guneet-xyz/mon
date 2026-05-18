import { getDaemonAssignments } from "@mon/config/schema"
import { type JobTile, JobsResponseSchema } from "@mon/contracts"

import { getCachedConfig } from "@/lib/server/config-cache"
import { verifyBearerToken } from "@/lib/server/daemon-auth"

function deriveCron(
  intervalSeconds: number | undefined,
  defaultIntervalMs: number,
): string {
  const seconds =
    intervalSeconds && intervalSeconds > 0
      ? intervalSeconds
      : Math.max(1, Math.round(defaultIntervalMs / 1000))

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

  const tiles = getDaemonAssignments(config, auth.daemonId)
  const defaultIntervalMs = config.options.ping_interval_ms

  const jobTiles: JobTile[] = tiles.map((tile) => {
    const cron = deriveCron(tile.interval_seconds, defaultIntervalMs)
    switch (tile.type) {
      case "host":
        return {
          kind: "host",
          id: tile.key,
          cron,
          address: tile.address,
        }
      case "website":
        return {
          kind: "website",
          id: tile.key,
          cron,
          url: tile.url,
        }
      case "container":
        return {
          kind: "container",
          id: tile.key,
          cron,
          container_name: tile.container_name,
          ...(tile.docker_socket ? { docker_socket: tile.docker_socket } : {}),
        }
      case "github":
        return {
          kind: "github",
          id: tile.key,
          cron,
          repo: tile.repo,
          ...(tile.github_token ? { github_token: tile.github_token } : {}),
        }
    }
  })

  return Response.json(JobsResponseSchema.parse({ tiles: jobTiles }))
}
