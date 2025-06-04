import { db } from "@mon/db"
import { execa } from "execa"
import { Host } from "packages/config/schema"
import { hostPings } from "packages/db/schema"
import { SimpleIntervalJob, Task } from "toad-scheduler"

export async function constructHostJob(host: Host): Promise<SimpleIntervalJob> {
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
  const job = new SimpleIntervalJob({ seconds: 60, runImmediately: true }, task)
  return job
}

async function pingHost(
  address: string,
): Promise<
  { success: true; latency: number } | { success: false; error: string }
> {
  try {
    const { stdout, exitCode } = await execa("ping", ["-c", "1", address], {
      reject: false,
    })
    if (exitCode == 2) return { success: false, error: "unreachable" }
    if (exitCode == 68) return { success: false, error: "timeout" }
    if (exitCode !== 0) {
      return { success: false, error: `ping failed with exit code ${exitCode}` }
    }
    const match = stdout.match(/time=(\d+(\.\d+)?) ms/)
    if (match) {
      return {
        success: true,
        latency: parseFloat(match[1]!),
      }
    }
    return { success: false, error: "couldn't parse output" }
  } catch (error) {
    return { success: false, error: "ping command failed" }
  }
}
