import { describe, expect, it } from "bun:test"

import type { SystemJobTile } from "@mon/contracts"

import {
  cpuPercent,
  parseCpuTimes,
  parseMemory,
  parseUptime,
  reportSystem,
  type SystemReaders,
} from "./system"

const MEMINFO = `MemTotal:        8095616 kB
MemFree:          512000 kB
MemAvailable:    4774980 kB
Buffers:          100000 kB
`

const stat = (user: number, idle: number) =>
  `cpu  ${user} 0 0 ${idle} 0 0 0 0 0 0\ncpu0 1 2 3 4 5 6 7 8 9 10\nintr 1\n`

const tile: SystemJobTile = {
  kind: "system",
  id: "agent-musashi",
  cron: "0 * * * * *",
  disks: [
    { path: "/host/root", name: "/" },
    { path: "/host/mnt", name: "/mnt" },
  ],
}

function readers(
  overrides: Partial<SystemReaders> & { user?: number; idle?: number } = {},
): SystemReaders {
  return {
    readProc: async (name) =>
      name === "stat"
        ? stat(overrides.user ?? 100, overrides.idle ?? 900)
        : name === "meminfo"
          ? MEMINFO
          : "560432.45 1100000.00\n",
    statfs: async (path) =>
      path === "/host/root"
        ? { blocks: 7_600_000, bfree: 800_000, bavail: 560_000, bsize: 4096 }
        : {
            blocks: 16_000_000,
            bfree: 4_500_000,
            bavail: 4_400_000,
            bsize: 4096,
          },
    ...overrides,
  }
}

describe("system parsing", () => {
  it("reads busy and total CPU time from the aggregate line", () => {
    expect(parseCpuTimes(stat(100, 900))).toEqual({ busy: 100, total: 1000 })
    expect(parseCpuTimes("intr 1\n")).toBeNull()
  })

  it("computes CPU % between samples", () => {
    expect(
      cpuPercent({ busy: 100, total: 1000 }, { busy: 150, total: 1200 }),
    ).toBeCloseTo(25)
    expect(cpuPercent(undefined, { busy: 1, total: 2 })).toBeNull()
    expect(
      cpuPercent({ busy: 10, total: 20 }, { busy: 5, total: 20 }),
    ).toBeNull()
  })

  it("reads used memory as total minus available", () => {
    expect(parseMemory(MEMINFO)).toEqual({
      used: (8095616 - 4774980) * 1024,
      total: 8095616 * 1024,
    })
    expect(parseMemory("MemTotal: 1 kB\n")).toBeNull()
  })

  it("reads whole seconds of uptime", () => {
    expect(parseUptime("560432.45 1100000.00\n")).toBe(560432)
  })
})

describe("reportSystem", () => {
  it("reports memory, uptime and disks like df", async () => {
    const report = await reportSystem(
      { ...tile, id: "first" },
      { readers: readers(), agentId: "musashi" },
    )
    expect(report).toMatchObject({
      kind: "system",
      key: "first",
      agent_id: "musashi",
      error: null,
      cpu_percent: null, // needs a second report
      memory_used_bytes: (8095616 - 4774980) * 1024,
      memory_total_bytes: 8095616 * 1024,
      uptime_seconds: 560432,
    })
    const root = report.disks[0]!
    expect(root.name).toBe("/")
    // df's Use%: used / (used + available).
    expect(root.used_bytes / root.total_bytes).toBeCloseTo(
      6_800_000 / (6_800_000 + 560_000),
    )
    expect(report.disks.map((d) => d.name)).toEqual(["/", "/mnt"])
  })

  it("measures CPU from the second report on", async () => {
    const id = { ...tile, id: "cpu" }
    await reportSystem(id, { readers: readers({ user: 100, idle: 900 }) })
    const second = await reportSystem(id, {
      readers: readers({ user: 400, idle: 1600 }),
    })
    expect(second.cpu_percent).toBeCloseTo(30)
  })

  it("leaves out a disk it cannot read without failing the report", async () => {
    const report = await reportSystem(
      { ...tile, id: "missing-disk" },
      {
        readers: readers({
          statfs: async (path) => {
            if (path === "/host/mnt") throw new Error("ENOENT")
            return { blocks: 10, bfree: 5, bavail: 5, bsize: 4096 }
          },
        }),
      },
    )
    expect(report.error).toBeNull()
    expect(report.disks.map((d) => d.name)).toEqual(["/"])
  })

  it("is an error only when nothing could be read", async () => {
    const report = await reportSystem(
      { ...tile, id: "broken" },
      {
        readers: {
          readProc: async () => {
            throw new Error("EACCES")
          },
          statfs: async () => {
            throw new Error("EACCES")
          },
        },
      },
    )
    expect(report.error).toContain("EACCES")
  })

  it("reads this machine's real /proc", async () => {
    const report = await reportSystem({
      ...tile,
      id: "real",
      disks: [{ path: "/", name: "/" }],
    })
    expect(report.error).toBeNull()
    expect(report.memory_total_bytes).toBeGreaterThan(0)
    expect(report.disks[0]!.total_bytes).toBeGreaterThan(0)
  })
})
