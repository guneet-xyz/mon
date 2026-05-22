import type { JobTile } from "@mon/contracts"

import { WebsiteApiClient } from "./client/api-client"
import { pingContainer } from "./jobs/container"
import { pingGithub } from "./jobs/github"
import { pingHost } from "./jobs/host"
import { pingWebsite } from "./jobs/website"

export async function executeJob(
  tile: JobTile,
  client: WebsiteApiClient,
): Promise<void> {
  try {
    switch (tile.kind) {
      case "host": {
        const dto = await pingHost(tile)
        await client.pushHostPing(dto)
        break
      }
      case "website": {
        const dto = await pingWebsite(tile)
        await client.pushWebsitePing(dto)
        break
      }
      case "container": {
        const dto = await pingContainer(tile)
        await client.pushContainerPing(dto)
        break
      }
      case "github": {
        const { ping, checkRuns } = await pingGithub(tile)
        await client.pushGithubPing(ping)
        for (const checkRun of checkRuns) {
          await client.pushGithubPing(checkRun)
        }
        break
      }
    }
  } catch (e) {
    console.error(`[agent] Error executing job ${tile.id}:`, e)
    // Never throw — pull loop must continue
  }
}
