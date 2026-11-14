import { readFile, statfs } from "node:fs/promises"

import type { SystemJobTile, SystemPingDTO } from "@mon/contracts"

import { env } from "../env"

// Readers for the machine's state. Inside a container /proc/stat, /proc/meminfo
// and /proc/uptime describe the host (they are not namespaced), and disk paths
// are read-only bind mounts of host filesystems.
export type SystemReaders = {
  readProc: (name: "stat" | "meminfo" | "uptime") => Promise<string>
  statfs: (
    path: string,
  ) => Promise<{ blocks: number; bfree: number; bavail: number; bsize: number }>
}

const defaultReaders: SystemReaders = {
  readProc: (name) => readFile(`/proc/${name}`, "utf8"),
  statfs: (path) => statfs(path),
}

type CpuTimes = { busy: number; total: number }

// CPU % is measured between this agent's consecutive reports.
const previousCpu = new Map<string, CpuTimes>()

export function parseCpuTimes(stat: string): CpuTimes | null {
  const line = stat.split("\n").find((l) => l.startsWith("cpu "))
  if (!line) return null
  // user nice system idle iowait irq softirq steal (guest time is already
  // counted in user and nice).
  const fields = line.trim().split(/\s+/).slice(1, 9).map(Number)
  if (fields.length < 5 || fields.some((n) => !Number.isFinite(n))) return null
  const total = fields.reduce((sum, n) => sum + n, 0)
  const idle = (fields[3] ?? 0) + (fields[4] ?? 0)
  return { busy: total - idle, total }
}

export function cpuPercent(
  previous: CpuTimes | undefined,
  current: CpuTimes,
): number | null {
  if (!previous) return null
  const total = current.total - previous.total
  const busy = current.busy - previous.busy
  if (total <= 0 || busy < 0) return null
  return (busy / total) * 100
}

export function parseMemory(
  meminfo: string,
): { used: number; total: number } | null {
  const kb = (field: string) => {
    const match = new RegExp(`^${field}:\\s+(\\d+) kB`, "m").exec(meminfo)
    return match ? Number(match[1]) * 1024 : null
  }
  const total = kb("MemTotal")
  const available = kb("MemAvailable")
  if (total === null || available === null) return null
  return { used: total - available, total }
}

export function parseUptime(uptime: string): number | null {
  const seconds = Number(uptime.trim().split(/\s+/)[0])
  return Number.isFinite(seconds) ? Math.floor(seconds) : null
}

export async function reportSystem(
  tile: SystemJobTile,
  deps?: { readers?: SystemReaders; agentId?: string },
): Promise<SystemPingDTO> {
  const readers = deps?.readers ?? defaultReaders
  const base = {
    kind: "system" as const,
    ping_id: crypto.randomUUID(),
    agent_id: deps?.agentId ?? env.AGENT_ID,
    recorded_at: new Date().toISOString(),
    key: tile.id,
  }
  const errors: string[] = []
  const attempt = async <T>(what: string, read: () => Promise<T>) => {
    try {
      return await read()
    } catch (error) {
      errors.push(`${what}: ${String(error)}`)
      return null
    }
  }

  const times = await attempt("cpu", async () =>
    parseCpuTimes(await readers.readProc("stat")),
  )
  let cpu_percent: number | null = null
  if (times) {
    cpu_percent = cpuPercent(previousCpu.get(tile.id), times)
    previousCpu.set(tile.id, times)
  }
  const memory = await attempt("memory", async () =>
    parseMemory(await readers.readProc("meminfo")),
  )
  const uptime = await attempt("uptime", async () =>
    parseUptime(await readers.readProc("uptime")),
  )

  const disks: SystemPingDTO["disks"] = []
  for (const disk of tile.disks) {
    const stats = await attempt(`disk ${disk.name}`, () =>
      readers.statfs(disk.path),
    )
    if (!stats) continue
    // Like df: the size counted is what is usable (used + available), so the
    // percentage matches df's Use% and ignores blocks reserved for root.
    const used = (stats.blocks - stats.bfree) * stats.bsize
    const available = stats.bavail * stats.bsize
    disks.push({
      name: disk.name,
      used_bytes: used,
      total_bytes: used + available,
    })
  }

  // A report means the machine is up, so partial failures (say, a disk path
  // that is not mounted) are only logged; the board flags disks that are
  // missing from the report. Only a report with nothing in it is an error.
  if (errors.length > 0)
    console.warn("[agent] system report:", errors.join("; "))
  const empty =
    times === null && memory === null && uptime === null && disks.length === 0
  return {
    ...base,
    error: empty ? (errors.join("; ") || "no system data").slice(0, 256) : null,
    cpu_percent,
    memory_used_bytes: memory?.used ?? null,
    memory_total_bytes: memory?.total ?? null,
    uptime_seconds: uptime,
    disks,
  }
}
