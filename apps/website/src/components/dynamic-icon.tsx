import { cn } from "@/lib/utils"

import { Icon } from "@iconify/react"

export function DynamicIcon({
  icon,
  className,
}: {
  icon: string
  className?: string
}) {
  return <Icon icon={icon} className={cn("h-8 w-8", className)} />
}
