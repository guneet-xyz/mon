import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import { cn } from "@/lib/utils"

export function BaseTile({
  r_span,
  c_span,
  status,
  title,
  orientation,
  icon,
  top_right_icon,
  className,
  children,
}: {
  r_span: number
  c_span: number
  title: string
  orientation?: "horizontal" | "vertical"
  status?: "online" | "offline" | "unknown"
  icon?: string
  top_right_icon?: string
  className?: string
  children?: React.ReactNode
}) {
  const showIconOnly = r_span === 1 && c_span === 1
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center rounded-xl border-2 inset-shadow-sm inset-shadow-emerald-500 transition-colors hover:cursor-pointer dark:border-emerald-950/20 dark:bg-emerald-700/25 dark:hover:bg-emerald-700/50",
        className,
      )}
    >
      {status ? (
        <StatusDot status={status} className="absolute top-2 right-2" />
      ) : null}

      {icon && showIconOnly ? (
        <DynamicIcon icon={icon} />
      ) : (
        <div
          className={cn("font-display text-xl dark:text-emerald-100", {
            "rotate-90": orientation === "vertical",
          })}
        >
          {title}
        </div>
      )}

      {top_right_icon ? (
        <DynamicIcon
          icon={top_right_icon}
          className="absolute top-2 left-2 text-emerald-700"
        />
      ) : null}

      {children}
    </div>
  )
}
