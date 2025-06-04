import { Website } from "@mon/config/schema"
import { db } from "@mon/db"
import { websitePings } from "@mon/db/schema"
import { execa } from "execa"
import { scheduleJob } from "node-schedule"

export function scheduleWebsiteJob(website: Website) {
  scheduleJob(`website-${website.key}`, "0 * * * * *", async () => {
    console.log(`Pinging website: ${website.key} (${website.url})`)
    const timestamp = new Date()
    const resp = await pingWebsite(website.url)
    if (!resp.success) {
      console.error(`Error pinging website ${website.key}:`, resp.error)
      await db.insert(websitePings).values({
        key: website.key,
        timestamp: timestamp,
        error: resp.error,
      })
    } else {
      console.log(`Website ${website.key} pinged successfully:`, resp.latency)
      await db.insert(websitePings).values({
        key: website.key,
        timestamp: timestamp,
        latency: resp.latency,
      })
    }
  })
}

async function pingWebsite(
  url: string,
): Promise<
  { success: true; latency: number } | { success: false; error: string }
> {
  try {
    const { stdout, exitCode } = await execa(
      "curl",
      ["-o", "/dev/null", "-s", "-w", "%{time_total}", url],
      {
        reject: false,
      },
    )
    if (exitCode !== 0) {
      return { success: false, error: `curl failed with exit code ${exitCode}` }
    }
    const latency_seconds = parseFloat(stdout.trim())
    if (isNaN(latency_seconds)) {
      return { success: false, error: "couldn't parse output" }
    }

    const latency_ms = latency_seconds * 1000
    return { success: true, latency: latency_ms }
  } catch (error) {
    return { success: false, error: "curl command failed" }
  }
}
