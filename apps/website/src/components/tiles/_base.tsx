import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import { cn } from "@/lib/utils"

export function BaseTile({
  status,
  title,
  orientation,
  icon,
}: {
  status: "online" | "offline" | "unknown"
  title: string
  orientation: "horizontal" | "vertical"
  icon?: string
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-xl border-2 inset-shadow-sm inset-shadow-emerald-500 transition-colors hover:cursor-pointer dark:border-emerald-950/20 dark:bg-emerald-700/25 dark:hover:bg-emerald-700/50">
      <StatusDot status={status} className="absolute top-2 right-2" />
      {icon ? (
        <DynamicIcon icon={icon} />
      ) : (
        <div
          className={cn("font-display text-[400%] dark:text-emerald-100", {
            "rotate-90": orientation === "vertical",
          })}
        >
          {title}
        </div>
      )}
    </div>
  )
}
