import { cn } from "@/lib/utils"

export function DuotoneHoverIcon({
  regular,
  hover,
  className,
}: {
  regular: React.ReactNode
  hover: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative inline-block", className)}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        {hover}
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-100 transition-opacity group-hover:opacity-0">
        {regular}
      </div>
    </div>
  )
}
