"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import {
  fitTitle,
  initialTitle,
  TITLE_PADDING_PX,
} from "@/lib/client/tile-title"
import { cn } from "@/lib/utils"

const TITLE_CLASS = "font-display whitespace-nowrap md:text-xl"

// r_span/c_span describe the tile's grid size; the title no longer depends
// on them because it is measured against the tile's actual size.
export function BaseTile({
  status,
  title,
  short_title,
  top_text,
  orientation,
  icon,
  top_right_icon,
  className,
  children,
  onClick,
  statusLine,
  label,
}: {
  r_span: number
  c_span: number
  title?: string // full name, shown whenever it fits
  short_title?: string // shown instead of the name when it does not fit
  top_text?: string
  orientation?: "horizontal" | "vertical"
  status?: "online" | "offline" | "unknown"
  icon?: string
  top_right_icon?: string
  className?: string
  children?: React.ReactNode
  onClick?: () => void
  statusLine?: Array<"online" | "offline" | "unknown">
  label?: string // accessible name when the tile acts as a button
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  // Scale for the full title, or null to show the compact title instead.
  const [scale, setScale] = useState<number | null>(1)

  useLayoutEffect(() => {
    const root = rootRef.current
    const measure = measureRef.current
    if (!root || !measure) return
    const check = () => {
      const room =
        orientation === "vertical" ? root.clientHeight : root.clientWidth
      setScale(fitTitle(room - TITLE_PADDING_PX, measure.offsetWidth))
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(root)
    return () => observer.disconnect()
  }, [title, orientation])

  const titleClass = cn(
    "text-center text-emerald-900 dark:text-emerald-100",
    TITLE_CLASS,
    { "rotate-90": orientation === "vertical" },
  )

  let content: React.ReactNode = null
  if (title && scale !== null) {
    content = (
      <div
        className={titleClass}
        style={scale < 1 ? { scale: String(scale) } : undefined}
      >
        {title}
      </div>
    )
  } else if (title && short_title) {
    content = <div className={titleClass}>{short_title}</div>
  } else if (icon) {
    content = (
      <DynamicIcon
        icon={icon}
        className="text-emerald-900 dark:text-emerald-100"
      />
    )
  } else if (title) {
    content = <div className={titleClass}>{initialTitle(title)}</div>
  }

  return (
    <div
      ref={rootRef}
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
      {...(label
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": label,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onClick?.()
              }
            },
          }
        : {})}
    >
      {top_text ? (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 font-display text-xs font-semibold text-emerald-500 md:text-sm dark:text-emerald-800">
          {top_text}
        </div>
      ) : null}

      {status ? (
        <StatusDot status={status} className="absolute top-2 right-2" />
      ) : null}

      {title ? (
        // Measures the full title in the title's font. The text comes from a
        // pseudo-element so it is not part of the page's text.
        <span
          ref={measureRef}
          aria-hidden
          data-text={title}
          className={cn(
            // w-max: an absolute element would otherwise shrink to the tile width.
            "pointer-events-none invisible absolute w-max before:content-[attr(data-text)]",
            TITLE_CLASS,
          )}
        />
      ) : null}

      {content}

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
