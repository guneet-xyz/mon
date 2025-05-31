import { cn } from "@/lib/utils"

import { Badge } from "./ui/badge"

export function Status({
  status,
}: {
  status: "online" | "offline" | "unknown"
}) {
  return (
    <Badge
      className={cn("flex items-center gap-2", {
        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300":
          status === "online",
        "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300":
          status === "offline",
        "bg-yellow-100 text-yellow-500 dark:bg-yellow-900 dark:text-yellow-300":
          status === "unknown",
      })}
    >
      <span
        className={cn("text-xs", {
          "text-green-500": status === "online",
          "text-red-500": status === "offline",
          "text-yellow-500": status === "unknown",
        })}
      >
        {status}
      </span>
      <div
        className={cn("h-2 w-2 rounded-full shadow-xl", {
          "bg-green-500": status === "online",
          "bg-red-500": status === "offline",
          "bg-yellow-500 shadow-yellow-700": status === "unknown",
        })}
      />
    </Badge>
  )
}
