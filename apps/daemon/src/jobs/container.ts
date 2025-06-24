import type { Container } from "@mon/config/schema"
import { db } from "@mon/db"
import { containerPings, websitePings } from "@mon/db/schema"

import { execa } from "execa"
import { scheduleJob } from "node-schedule"

export function scheduleContainerJob(container: Container) {
  scheduleJob(`container-${container.key}`, "0 * * * * *", async () => {
    console.log(
      `Pinging container: ${container.key} (${container.container_name})`,
    )
    const timestamp = new Date()
    const resp = await pingContainer(
      container.container_name,
      container.docker_socket,
    )
    if (!resp.success) {
      console.error(`Error pinging container ${container.key}:`, resp.error)
      await db.insert(websitePings).values({
        key: container.key,
        timestamp: timestamp,
        error: resp.error,
      })
    } else {
      console.log(`Container ${container.key} pinged successfully`)
      await db.insert(websitePings).values({
        key: container.key,
        timestamp: timestamp,
      })
    }
  })
}

async function pingContainer(
  containerName: string,
  socket: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const unixSocket = socket.startsWith("unix://") ? socket.slice(7) : null
  const timestamp = new Date()
  try {
    const { exitCode, stdout } = await execa("curl", [
      "--silent",
      ...(unixSocket ? ["--unix-socket", unixSocket] : []),
      `${unixSocket ? "http://whatever" : socket}/v1.41/containers/${containerName}/json`,
    ])
    if (exitCode !== 0) {
      await db.insert(containerPings).values({
        key: containerName,
        timestamp: timestamp,
        error: `curl failed with exit code ${exitCode}`,
      })
      return {
        success: false,
        error: `curl failed with exit code ${exitCode}`,
      }
    }
    const output = JSON.parse(stdout)
    const running = output.State?.Status === "running"
    if (running) {
      await db.insert(containerPings).values({
        key: containerName,
        timestamp: timestamp,
      })
      return { success: true }
    }
    await db.insert(containerPings).values({
      key: containerName,
      timestamp: timestamp,
    })
    return {
      success: false,
      error: `container is offline`,
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}
