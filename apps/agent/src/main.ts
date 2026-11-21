import { WebsiteApiClient } from "./client/api-client"
import { startPullLoop } from "./client/pull-loop"
import { env } from "./env"
import { executeJob } from "./index"
import { JobScheduler } from "./scheduler"

const client = new WebsiteApiClient(
  env.WEBSITE_URL,
  env.AGENT_ID,
  env.AGENT_TOKEN,
)

const controller = new AbortController()

const scheduler = new JobScheduler({
  run: (tile) => executeJob(tile, client),
  fallbackIntervalSeconds: env.AGENT_POLL_INTERVAL_SECONDS,
})

function gracefulShutdown(signal: string) {
  console.log(`[agent] Received ${signal}, shutting down...`)
  controller.abort()
  scheduler.stop()
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

console.log(`[agent] Starting — id=${env.AGENT_ID}, website=${env.WEBSITE_URL}`)

startPullLoop({
  client,
  intervalSeconds: env.AGENT_POLL_INTERVAL_SECONDS,
  onJobsUpdated: (tiles) => scheduler.update(tiles),
  signal: controller.signal,
}).catch((e) => {
  console.error("[agent] Pull loop fatal error:", e)
  process.exit(1)
})
