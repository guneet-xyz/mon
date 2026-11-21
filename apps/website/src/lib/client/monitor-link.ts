import type { PublicMonitorTile } from "@mon/config/schema"

export type MonitorLink = { href: string; label: string }

type Monitor<T extends PublicMonitorTile["type"]> = Extract<
  PublicMonitorTile,
  { type: T }
>
type LinkSource =
  | Pick<Monitor<"website">, "type" | "url">
  | Pick<Monitor<"github">, "type" | "repo">
  | { type: Exclude<PublicMonitorTile["type"], "website" | "github"> }

// Where a monitor's dialog links to: the monitored site, or the GitHub
// repository. Only http(s) URLs are linked.
export function monitorLink(
  config: LinkSource | undefined,
): MonitorLink | null {
  if (config?.type === "website") {
    let url: URL
    try {
      url = new URL(config.url)
    } catch {
      return null
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return {
      href: url.href,
      label: config.url.replace(/^\w+:\/\//, "").replace(/\/$/, ""),
    }
  }
  if (config?.type === "github") {
    return {
      href: `https://github.com/${config.repo}`,
      label: `github.com/${config.repo}`,
    }
  }
  return null
}
