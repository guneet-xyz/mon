import type { JobTile } from "@mon/contracts"
import { agentEnv } from "@mon/env"

import { WebsiteApiClient } from "./client/api-client"
import { startPullLoop } from "./client/pull-loop"
import { pingContainer } from "./jobs/container"
import { pingGithub } from "./jobs/github"
import { pingHost } from "./jobs/host"
import { pingWebsite } from "./jobs/website"

const client = new WebsiteApiClient(
  agentEnv.WEBSITE_URL,
  agentEnv.AGENT_ID,
  agentEnv.AGENT_TOKEN,
)

async function executeJob(tile: JobTile): Promise<void> {
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

const controller = new AbortController()

function gracefulShutdown(signal: string) {
  console.log(`[agent] Received ${signal}, shutting down...`)
  controller.abort()
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

console.log(
  `[agent] Starting — id=${agentEnv.AGENT_ID}, website=${agentEnv.WEBSITE_URL}`,
)

startPullLoop({
  client,
  intervalSeconds: agentEnv.AGENT_POLL_INTERVAL_SECONDS,
  onJobsUpdated: (tiles) => {
    for (const tile of tiles) {
      executeJob(tile).catch((e) =>
        console.error("[agent] Unhandled job error:", e),
      )
    }
  },
  signal: controller.signal,
}).catch((e) => {
  console.error("[agent] Pull loop fatal error:", e)
  process.exit(1)
})
