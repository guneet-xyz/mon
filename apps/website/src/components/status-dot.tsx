import { cn } from "@/lib/utils"

export function StatusDot({
  status,
  className,
}: {
  status: "online" | "offline" | "unknown"
  className?: string
}) {
  return (
    <div
      className={cn(
        "h-2.5 w-2.5 rounded-full border-2 shadow-xl",
        {
          "border-green-700 bg-green-500 shadow-green-300 dark:border-green-900 dark:shadow-green-700":
            status === "online",
          "border-red-700 bg-red-500 shadow-red-300 dark:border-red-900 dark:shadow-red-700":
            status === "offline",
          "border-yellow-700 bg-yellow-500 shadow-yellow-300 dark:border-yellow-900 dark:shadow-yellow-700":
            status === "unknown",
        },
        className,
      )}
    />
  )
}
