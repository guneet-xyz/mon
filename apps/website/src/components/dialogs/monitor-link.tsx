import { ExternalLink } from "lucide-react"

import { monitorLink } from "@/lib/client/monitor-link"

export function MonitorLink({
  config,
}: {
  config: Parameters<typeof monitorLink>[0]
}) {
  const link = monitorLink(config)
  if (!link) return null
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="monitor-link"
      className="inline-flex max-w-full items-center gap-1 justify-self-start text-sm text-neutral-500 underline-offset-4 hover:text-foreground hover:underline"
    >
      <span className="truncate">{link.label}</span>
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
