import { execa } from "execa"

export async function pingHost(
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

export async function pingWebsite(
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
