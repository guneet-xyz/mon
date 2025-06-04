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
        "h-2 w-2 rounded-full shadow-xl",
        {
          "bg-green-500": status === "online",
          "bg-red-500": status === "offline",
          "bg-yellow-500 shadow-yellow-700": status === "unknown",
        },
        className,
      )}
    />
  )
}
