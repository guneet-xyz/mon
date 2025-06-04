import { Container } from "@mon/config/schema"
import { db } from "@mon/db"
import { websitePings } from "@mon/db/schema"
import { execa } from "execa"
import { SimpleIntervalJob, Task } from "toad-scheduler"

export async function constructContainerJob(
  container: Container,
): Promise<SimpleIntervalJob> {
  const task = new Task(`container-${container.key}`, async () => {
    console.log(
      `Pinging container: ${container.key} (${container.container_name})`,
    )
    const timestamp = new Date()
    const resp = await pingContainer(container.container_name)
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
  const job = new SimpleIntervalJob({ seconds: 60, runImmediately: true }, task)
  return job
}

async function pingContainer(
  containerName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { exitCode } = await execa("docker", [
      "inspect",
      "--format",
      "{{.State.Running}}",
      containerName,
    ])
    if (exitCode !== 0) {
      return {
        success: false,
        error: `docker inspect failed with exit code ${exitCode}`,
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: "docker command failed" }
  }
}
