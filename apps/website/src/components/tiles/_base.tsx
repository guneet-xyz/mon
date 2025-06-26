import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import { cn } from "@/lib/utils"

export function BaseTile({
  r_span,
  c_span,
  status,
  title,
  top_text,
  orientation,
  icon,
  top_right_icon,
  className,
  children,
  onClick,
  statusLine,
}: {
  r_span: number
  c_span: number
  title?: string
  top_text?: string
  orientation?: "horizontal" | "vertical"
  status?: "online" | "offline" | "unknown"
  icon?: string
  top_right_icon?: string
  className?: string
  children?: React.ReactNode
  onClick?: () => void
  statusLine?: Array<"online" | "offline" | "unknown">
}) {
  const showIconOnly = r_span === 1 && c_span === 1
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl transition-colors hover:cursor-pointer",
        "shadow-sm shadow-emerald-600 dark:shadow-emerald-700",
        "bg-emerald-200/70 hover:bg-emerald-300 dark:bg-emerald-900/70 dark:hover:bg-emerald-950",
        "border-2 border-emerald-700 dark:border-emerald-950/20",
        {
          "border-b-1": statusLine && statusLine.length > 0,
        },
        className,
      )}
      onClick={onClick}
    >
      {top_text ? (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 font-display text-xs font-semibold text-emerald-500 md:text-sm dark:text-emerald-800">
          {top_text}
        </div>
      ) : null}

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

      {statusLine && statusLine.length > 0 ? (
        <div className="absolute bottom-0 left-0 flex h-1 w-full divide-x-2 divide-emerald-700 dark:divide-emerald-950">
          {statusLine.map((status, index) => (
            <div
              key={index}
              className={cn("h-full grow", {
                "bg-gradient-to-b from-green-500 to-green-600 dark:from-green-600 dark:to-green-700":
                  status === "online",
                "bg-gradient-to-b from-rose-500 to-rose-600 dark:from-rose-600 dark:to-rose-700":
                  status === "offline",
                "bg-gradient-to-b from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700":
                  status === "unknown",
              })}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
