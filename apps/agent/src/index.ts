import type { JobTile } from "@mon/contracts"

import { WebsiteApiClient } from "./client/api-client"
import { pingContainer as defaultPingContainer } from "./jobs/container"
import { pingGithub as defaultPingGithub } from "./jobs/github"
import { pingHost as defaultPingHost } from "./jobs/host"
import { reportSystem as defaultReportSystem } from "./jobs/system"
import { pingWebsite as defaultPingWebsite } from "./jobs/website"

export interface ExecuteJobDeps {
  pingHost?: typeof defaultPingHost
  pingWebsite?: typeof defaultPingWebsite
  pingContainer?: typeof defaultPingContainer
  pingGithub?: typeof defaultPingGithub
  reportSystem?: typeof defaultReportSystem
}

export async function executeJob(
  tile: JobTile,
  client: WebsiteApiClient,
  deps: ExecuteJobDeps = {},
): Promise<void> {
  const pingHost = deps.pingHost ?? defaultPingHost
  const pingWebsite = deps.pingWebsite ?? defaultPingWebsite
  const pingContainer = deps.pingContainer ?? defaultPingContainer
  const pingGithub = deps.pingGithub ?? defaultPingGithub
  const reportSystem = deps.reportSystem ?? defaultReportSystem

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
        const { pings, checkRuns } = await pingGithub(tile)
        for (const checkRun of checkRuns) {
          await client.pushGithubPing(checkRun)
        }
        for (const ping of pings) {
          await client.pushGithubPing(ping)
        }
        break
      }
      case "system": {
        const dto = await reportSystem(tile)
        await client.pushSystemPing(dto)
        break
      }
    }
  } catch (e) {
    console.error(`[agent] Error executing job ${tile.id}:`, e)
    // Never throw — pull loop must continue
  }
}
