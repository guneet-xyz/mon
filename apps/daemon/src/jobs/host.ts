import { daemonEnv } from "@mon/env"
import type { HostJobTile, HostPingDTO } from "@mon/contracts"

import { execa } from "execa"

export async function pingHost(
  tile: HostJobTile,
  deps?: { execa?: typeof execa; daemonId?: string },
): Promise<HostPingDTO> {
  const pingId = crypto.randomUUID()
  const daemonId = deps?.daemonId ?? daemonEnv.DAEMON_ID
  const recordedAt = new Date().toISOString()
  const key = `host:${tile.address}`

  try {
    const execaFn = deps?.execa ?? execa
    const { stdout, exitCode } = await execaFn("ping", ["-c", "1", tile.address], {
      reject: false,
    })

    if (exitCode === 2) {
      return {
        kind: "host",
        ping_id: pingId,
        daemon_id: daemonId,
        recorded_at: recordedAt,
        key,
        latency_ms: null,
        error: "unreachable",
      }
    }
    if (exitCode === 68) {
      return {
        kind: "host",
        ping_id: pingId,
        daemon_id: daemonId,
        recorded_at: recordedAt,
        key,
        latency_ms: null,
        error: "timeout",
      }
    }
    if (exitCode !== 0) {
      return {
        kind: "host",
        ping_id: pingId,
        daemon_id: daemonId,
        recorded_at: recordedAt,
        key,
        latency_ms: null,
        error: `ping failed with exit code ${exitCode}`,
      }
    }

    const match = stdout.match(/time=(\d+(\.\d+)?) ms/)
    if (match) {
      const latencyMs = parseFloat(match[1]!)
      return {
        kind: "host",
        ping_id: pingId,
        daemon_id: daemonId,
        recorded_at: recordedAt,
        key,
        latency_ms: latencyMs,
        error: null,
      }
    }

    return {
      kind: "host",
      ping_id: pingId,
      daemon_id: daemonId,
      recorded_at: recordedAt,
      key,
      latency_ms: null,
      error: "couldn't parse output",
    }
  } catch (error) {
    return {
      kind: "host",
      ping_id: pingId,
      daemon_id: daemonId,
      recorded_at: recordedAt,
      key,
      latency_ms: null,
      error: String(error),
    }
  }
}
