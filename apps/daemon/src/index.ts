import { pingContainer, pingHost, pingWebsite } from "./utils"

import { getConfig } from "@mon/config"
import { db } from "@mon/db"
import { hostPings } from "packages/db/schema"
import { SimpleIntervalJob, Task, ToadScheduler } from "toad-scheduler"

const scheduler = new ToadScheduler()

async function main() {
  console.log("main")
  const config = await getConfig()
  console.log("config", config)

  for (const host of config.hosts) {
    const task = new Task(`host-${host.key}`, async () => {
      console.log(`Pinging host: ${host.key} (${host.address})`)
      const timestamp = new Date()
      const resp = await pingHost(host.address)
      if (!resp.success) {
        console.error(`Error pinging host ${host.key}:`, resp.error)
        await db.insert(hostPings).values({
          key: host.key,
          timestamp: timestamp,
          error: resp.error,
        })
      } else {
        console.log(`Host ${host.key} pinged successfully:`, resp.latency)
        await db.insert(hostPings).values({
          key: host.key,
          timestamp: timestamp,
          latency: resp.latency,
        })
      }
    })
    const job = new SimpleIntervalJob(
      { seconds: 60, runImmediately: true },
      task,
    )
    scheduler.addSimpleIntervalJob(job)
  }

  for (const website of config.websites) {
    const task = new Task(`website-${website.key}`, async () => {
      console.log(`Pinging website: ${website.key} (${website.url})`)
      const timestamp = new Date()
      const resp = await pingWebsite(website.url)
      if (!resp.success) {
        console.error(`Error pinging website ${website.key}:`, resp.error)
        await db.insert(hostPings).values({
          key: website.key,
          timestamp: timestamp,
          error: resp.error,
        })
      } else {
        console.log(`Website ${website.key} pinged successfully:`, resp.latency)
        await db.insert(hostPings).values({
          key: website.key,
          timestamp: timestamp,
          latency: resp.latency,
        })
      }
    })
    const job = new SimpleIntervalJob(
      { seconds: 60, runImmediately: true },
      task,
    )
    scheduler.addSimpleIntervalJob(job)
  }

  for (const container of config.containers) {
    const task = new Task(`container-${container.key}`, async () => {
      console.log(
        `Pinging container: ${container.key} (${container.container_name})`,
      )
      const timestamp = new Date()
      const resp = await pingContainer(container.container_name)
      if (!resp.success) {
        console.error(`Error pinging container ${container.key}:`, resp.error)
        await db.insert(hostPings).values({
          key: container.key,
          timestamp: timestamp,
          error: resp.error,
        })
      } else {
        console.log(`Container ${container.key} pinged successfully`)
        await db.insert(hostPings).values({
          key: container.key,
          timestamp: timestamp,
        })
      }
    })
    const job = new SimpleIntervalJob(
      { seconds: 60, runImmediately: true },
      task,
    )
    scheduler.addSimpleIntervalJob(job)
  }
}

function gracefulExit() {
  console.log("Gracefully shutting down...")
  scheduler.stop()
  console.log("Scheduler stopped.")
  console.log("Graceful shutdown complete.")
}

process.on("SIGINT", gracefulExit)

main().catch((err) => {
  console.error("Error in main:", err)
  process.exit(1)
})
