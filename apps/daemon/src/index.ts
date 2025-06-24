import { scheduleContainerJob } from "./jobs/container"
import { scheduleGithubJob } from "./jobs/github"
import { scheduleHostJob } from "./jobs/host"
import { scheduleWebsiteJob } from "./jobs/website"

import { getConfig } from "@mon/config"

async function main() {
  console.log("main")
  const config = await getConfig()
  console.log("config", config)

  const hosts = config.tiles.filter((tile) => tile.type === "host")
  for (const host of hosts) {
    scheduleHostJob(host)
  }

  const websites = config.tiles.filter((tile) => tile.type === "website")
  for (const website of websites) {
    scheduleWebsiteJob(website)
  }

  const containers = config.tiles.filter((tile) => tile.type === "container")
  for (const container of containers) {
    scheduleContainerJob(container)
  }

  const githubs = config.tiles.filter((tile) => tile.type === "github")
  for (const github of githubs) {
    scheduleGithubJob(github)
  }
}

function gracefulExit(event: string) {
  console.log(`Received ${event}. Initiating graceful shutdown...`)
  console.log("No cleanup needed.")
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
