import type { JobTile } from "@mon/contracts"
import { env } from "./env"

import { WebsiteApiClient } from "./client/api-client"
import { startPullLoop } from "./client/pull-loop"
import { pingContainer } from "./jobs/container"
import { pingGithub } from "./jobs/github"
import { pingHost } from "./jobs/host"
import { pingWebsite } from "./jobs/website"

const client = new WebsiteApiClient(
  env.WEBSITE_URL,
  env.AGENT_ID,
  env.AGENT_TOKEN,
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
  `[agent] Starting — id=${env.AGENT_ID}, website=${env.WEBSITE_URL}`,
)

startPullLoop({
  client,
  intervalSeconds: env.AGENT_POLL_INTERVAL_SECONDS,
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
