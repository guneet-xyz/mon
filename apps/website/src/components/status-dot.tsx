import { cn } from "@/lib/utils"

// `warning` turns an online dot amber, matching a tile with a warning.
export function StatusDot({
  status,
  warning,
  className,
}: {
  status: "online" | "offline" | "unknown"
  warning?: boolean
  className?: string
}) {
  const amber = status === "online" && warning
  return (
    <div
      data-status={status}
      className={cn(
        "h-2.5 w-2.5 rounded-full border-2 shadow-xl",
        {
          "border-green-700 bg-green-500 shadow-green-300 dark:border-green-900 dark:shadow-green-700":
            status === "online" && !amber,
          "border-amber-700 bg-amber-400 shadow-amber-300 dark:border-amber-900 dark:shadow-amber-700":
            amber,
          "border-red-700 bg-red-500 shadow-red-300 dark:border-red-900 dark:shadow-red-700":
            status === "offline",
          "border-stone-600 bg-stone-400 shadow-stone-300 dark:border-stone-800 dark:shadow-stone-700":
            status === "unknown",
        },
        className,
      )}
    />
  )
}
