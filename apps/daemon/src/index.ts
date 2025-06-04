import { constructContainerJob } from "./jobs/container"
import { constructHostJob } from "./jobs/host"
import { constructWebsiteJob } from "./jobs/website"

import { getConfig } from "@mon/config"
import { ToadScheduler } from "toad-scheduler"

const scheduler = new ToadScheduler()

async function main() {
  console.log("main")
  const config = await getConfig()
  console.log("config", config)

  const hosts = config.tiles.filter((tile) => tile.type === "host")
  for (const host of hosts) {
    const job = await constructHostJob(host)
    scheduler.addSimpleIntervalJob(job)
  }

  const websites = config.tiles.filter((tile) => tile.type === "website")
  for (const website of websites) {
    const job = await constructWebsiteJob(website)
    scheduler.addSimpleIntervalJob(job)
  }

  const containers = config.tiles.filter((tile) => tile.type === "container")
  for (const container of containers) {
    const job = await constructContainerJob(container)
    scheduler.addSimpleIntervalJob(job)
  }
}

function gracefulExit(event: string) {
  console.log(`Received ${event}. Initiating graceful shutdown...`)
  scheduler.stop()
  console.log("Scheduler stopped.")
  console.log("Graceful shutdown complete.")
  process.exit(0)
}

process.on("SIGINT", gracefulExit)
process.on("SIGTERM", gracefulExit)
process.on("SIGKILL", gracefulExit)

main().catch((err) => {
  console.error("Error in main:", err)
  process.exit(1)
})
