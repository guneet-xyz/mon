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
  onClick,
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
  onClick?: () => void
}) {
  const showIconOnly = r_span === 1 && c_span === 1
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center rounded-xl transition-colors hover:cursor-pointer",
        "shadow-sm shadow-emerald-600 dark:shadow-emerald-700",
        "bg-emerald-200/70 hover:bg-emerald-300 dark:bg-emerald-900/70 dark:hover:bg-emerald-950",
        "border-2 border-emerald-700 dark:border-emerald-950/20",
        className,
      )}
      onClick={onClick}
    >
      {status ? (
        <StatusDot status={status} className="absolute top-2 right-2" />
      ) : null}

      {icon && showIconOnly ? (
        <DynamicIcon
          icon={icon}
          className="text-emerald-900 dark:text-emerald-100"
        />
      ) : (
        <div
          className={cn(
            "text-center font-display text-emerald-900 md:text-xl dark:text-emerald-100",
            {
              "rotate-90": orientation === "vertical",
            },
          )}
        >
          {title}
        </div>
      )}

      {top_right_icon ? (
        <DynamicIcon
          icon={top_right_icon}
          className="absolute top-2 left-2 size-4 text-emerald-700 md:size-4"
        />
      ) : null}

      {children}
    </div>
  )
}
