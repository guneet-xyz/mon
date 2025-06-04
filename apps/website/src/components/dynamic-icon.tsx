import { Icon } from "@iconify/react"

export function DynamicIcon({ icon }: { icon: string }) {
  return <Icon icon={icon} className="h-8 w-8 dark:text-emerald-100" />
}
