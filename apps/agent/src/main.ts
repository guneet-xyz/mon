import { WebsiteApiClient } from "./client/api-client"
import { startPullLoop } from "./client/pull-loop"
import { env } from "./env"
import { executeJob } from "./index"

const client = new WebsiteApiClient(
  env.WEBSITE_URL,
  env.AGENT_ID,
  env.AGENT_TOKEN,
)

const controller = new AbortController()

function gracefulShutdown(signal: string) {
  console.log(`[agent] Received ${signal}, shutting down...`)
  controller.abort()
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

console.log(`[agent] Starting — id=${env.AGENT_ID}, website=${env.WEBSITE_URL}`)

startPullLoop({
  client,
  intervalSeconds: env.AGENT_POLL_INTERVAL_SECONDS,
  onJobsUpdated: (tiles) => {
    for (const tile of tiles) {
      executeJob(tile, client).catch((e) =>
        console.error("[agent] Unhandled job error:", e),
      )
    }
  },
  signal: controller.signal,
}).catch((e) => {
  console.error("[agent] Pull loop fatal error:", e)
  process.exit(1)
})
