// Compact, human-readable values for tiles and the monitor dialog.

export function formatLatency(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

export function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`
  return `${Math.round(value)}%`
}

const UNITS = ["B", "KB", "MB", "GB", "TB"]

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit++
  }
  const digits = value < 10 && unit > 0 ? 1 : 0
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

// Uptime ratio (0-1) as a percentage, without rounding a failure up to 100%.
export function formatUptime(ratio: number | null | undefined): string | null {
  if (ratio === null || ratio === undefined) return null
  if (ratio === 1) return "100%"
  const percent = Math.floor(ratio * 10_000) / 100
  return `${percent.toFixed(percent >= 99 ? 2 : 1)}%`
}

// Rough duration between two times, e.g. "6 d 3 h", "4 h 12 min", "35 s".
export function formatDuration(from: Date, to: Date = new Date()): string {
  const seconds = Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / 1000),
  )
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return `${seconds} s`
}
