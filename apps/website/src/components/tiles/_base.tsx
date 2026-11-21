"use client"

import { CircleHelp, CircleX, TriangleAlert } from "lucide-react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"

import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import {
  initialTitle,
  SQUEEZE_SCALES,
  TITLE_PADDING_PX,
  TITLE_SCALES,
} from "@/lib/client/tile-title"
import type { Tone } from "@/lib/tile-state"
import { cn } from "@/lib/utils"

const TITLE_CLASS = "font-display leading-tight md:text-xl"

// The whole tile changes with its state, so a problem reads at a distance
// and without colour vision: each state has its own border, icon and words.
const TONE_CLASS: Record<Tone, string> = {
  ok: cn(
    "border-2 border-emerald-700 bg-emerald-200/70 shadow-emerald-600",
    "dark:border-emerald-950/20 dark:bg-emerald-900/70 dark:shadow-emerald-700",
  ),
  warning: cn(
    "border-[3px] border-amber-600 bg-amber-100 shadow-amber-700",
    "dark:border-amber-500 dark:bg-amber-950/80 dark:shadow-amber-900",
  ),
  down: cn(
    "border-[3px] border-rose-700 bg-rose-200 shadow-rose-800",
    "dark:border-rose-500 dark:bg-rose-950/80 dark:shadow-rose-900",
  ),
  unknown: cn(
    "border-2 border-dashed border-stone-500 bg-stone-200 shadow-stone-600",
    "dark:border-stone-500 dark:bg-stone-800/80 dark:shadow-stone-900",
  ),
}

const HOVER_CLASS: Record<Tone, string> = {
  ok: "hover:bg-emerald-300 dark:hover:bg-emerald-950",
  warning: "hover:bg-amber-200 dark:hover:bg-amber-950",
  down: "hover:bg-rose-300 dark:hover:bg-rose-950",
  unknown: "hover:bg-stone-300 dark:hover:bg-stone-900",
}

const TITLE_TONE: Record<Tone, string> = {
  ok: "text-emerald-900 dark:text-emerald-100",
  warning: "text-amber-950 dark:text-amber-50",
  down: "text-rose-950 dark:text-rose-50",
  unknown: "text-stone-800 dark:text-stone-100",
}

// Secondary text (address, uptime, current value). At least 4.5:1 on the
// tile in both themes.
const TEXT_TONE: Record<Tone, string> = {
  ok: "text-emerald-800 dark:text-emerald-200",
  warning: "text-amber-900 dark:text-amber-200",
  down: "text-rose-900 dark:text-rose-200",
  unknown: "text-stone-700 dark:text-stone-300",
}

const TONE_ICON = {
  warning: TriangleAlert,
  down: CircleX,
  unknown: CircleHelp,
}

// How the title is shown: the full name (wrapped at spaces, scaled down a
// little if needed), short_name, the icon, or as a last resort the full name
// at the smallest size, broken inside words.
// Short tiles give up secondary lines first, so the name and the problem keep
// their room: "short" drops the top text and keeps one line of values.
type Height = "tall" | "medium" | "short"
const heightOf = (px: number): Height =>
  px >= 104 ? "tall" : px >= 76 ? "medium" : "short"

type TitleFit =
  | { mode: "full" | "short" | "squeeze"; scale: number; lines?: number }
  | { mode: "icon" | "initial" }

// r_span/c_span describe the tile's grid size; the title does not depend on
// them because it is measured against the tile's actual size.
export function BaseTile({
  status,
  tone = "ok",
  title,
  short_title,
  top_text,
  bottom_text,
  bottom_detail,
  orientation,
  icon,
  top_right_icon,
  className,
  children,
  onClick,
  statusLine,
  label,
  large_bottom,
  ref,
  r_span: _r_span,
  c_span: _c_span,
  ...rest
}: {
  r_span: number
  c_span: number
  title?: string // full name, shown whenever it fits
  short_title?: string // shown instead of the name when it does not fit
  top_text?: string // dropped when it does not fit
  // The problem when there is one (tone other than "ok"), otherwise the
  // monitor's current value, e.g. latency. Values are joined with " · ";
  // the ones that don't fit wrap to a second line, then are dropped.
  bottom_text?: string | null
  bottom_detail?: string // tooltip for the bottom text, e.g. every warning
  large_bottom?: boolean // bottom text as prominent as a problem (groups)
  orientation?: "horizontal" | "vertical"
  status?: "online" | "offline" | "unknown"
  tone?: Tone
  icon?: string
  top_right_icon?: string
  className?: string
  children?: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLDivElement>
  statusLine?: Array<Tone>
  label?: string // accessible name when the tile acts as a button
  ref?: React.Ref<HTMLDivElement>
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onClick">) {
  const rootRef = useRef<HTMLDivElement>(null)
  const middleRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<TitleFit>({ mode: "full", scale: 1 })
  const [topFits, setTopFits] = useState(true)
  const [height, setHeight] = useState<Height>("tall")

  useLayoutEffect(() => {
    const root = rootRef.current
    const middle = middleRef.current
    const measure = measureRef.current
    if (!root || !middle) return
    const check = () => {
      const size = heightOf(root.clientHeight)
      setHeight(size)
      // Measured again once the tile has re-rendered at its new height.
      if (size !== height) return
      const top = topRef.current
      setTopFits(!top || top.scrollWidth <= top.clientWidth)
      if (!title || !measure) return
      measure.style.fontSize = ""
      const base = parseFloat(getComputedStyle(measure).fontSize)
      const vertical = orientation === "vertical"
      const width =
        (vertical ? root.clientHeight : root.clientWidth) - TITLE_PADDING_PX
      const room = vertical ? Infinity : middle.clientHeight

      // Whether `text` fits at `scale`, wrapping only at spaces (never for
      // vertical titles).
      const fits = (text: string, scale: number) => {
        measure.style.fontSize = `${base * scale}px`
        measure.style.whiteSpace = "nowrap"
        measure.style.width = "max-content"
        const words = vertical ? [text] : text.split(/\s+/)
        for (const word of words) {
          measure.dataset.text = word
          if (measure.offsetWidth > width) return false
        }
        measure.dataset.text = text
        measure.style.whiteSpace = "normal"
        measure.style.width = `${width}px`
        return measure.offsetHeight <= room
      }
      const largest = (text: string) =>
        TITLE_SCALES.find((scale) => fits(text, scale))

      const full = largest(title)
      const short = short_title ? largest(short_title) : undefined
      const small = SQUEEZE_SCALES.find((scale) => fits(title, scale))
      const scale = SQUEEZE_SCALES.at(-1)!
      if (full !== undefined) setFit({ mode: "full", scale: full })
      else if (short !== undefined) setFit({ mode: "short", scale: short })
      else if (icon) setFit({ mode: "icon" })
      else if (vertical) setFit({ mode: "initial" })
      else if (small !== undefined) setFit({ mode: "full", scale: small })
      else
        setFit({
          mode: "squeeze",
          scale,
          lines: Math.max(1, Math.floor(room / (base * scale * 1.25))),
        })
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(root)
    return () => observer.disconnect()
  }, [title, short_title, icon, orientation, top_text, height])

  const setRef = (node: HTMLDivElement | null) => {
    rootRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }

  const titleClass = cn(
    "max-w-full text-center",
    TITLE_TONE[tone],
    TITLE_CLASS,
    orientation === "vertical"
      ? "rotate-90 whitespace-nowrap"
      : "text-balance break-words",
  )

  let content: React.ReactNode = null
  if (title && (fit.mode === "full" || fit.mode === "short")) {
    content = (
      <div
        className={titleClass}
        style={fit.scale < 1 ? { fontSize: `${fit.scale}em` } : undefined}
      >
        {fit.mode === "full" ? title : short_title}
      </div>
    )
  } else if (title && fit.mode === "squeeze") {
    content = (
      <div
        lang="en"
        className={cn(titleClass, "[overflow-wrap:anywhere] hyphens-auto")}
        style={{
          fontSize: `${fit.scale}em`,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: fit.lines,
          overflow: "hidden",
        }}
      >
        {title}
      </div>
    )
  } else if (icon) {
    content = <DynamicIcon icon={icon} className={TITLE_TONE[tone]} />
  } else if (title) {
    content = <div className={titleClass}>{initialTitle(title)}</div>
  }

  const interactive = onClick !== undefined
  const ToneIcon = tone === "ok" ? null : TONE_ICON[tone]
  const prominent = large_bottom === true || tone !== "ok"
  const values = bottom_text ? bottom_text.split(" · ") : []

  return (
    <div
      {...rest}
      ref={setRef}
      data-tone={tone}
      className={cn(
        "@container relative flex h-full w-full flex-col items-center overflow-hidden rounded-xl px-1.5 py-1.5 shadow-sm transition-colors @min-[9rem]:px-2",
        TONE_CLASS[tone],
        interactive && [
          "hover:cursor-pointer",
          HOVER_CLASS[tone],
          "outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-500 dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-neutral-950",
        ],
        {
          "border-b-1": statusLine && statusLine.length > 0,
        },
        className,
      )}
      onClick={onClick}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            ...(label ? { "aria-label": label } : {}),
            onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                event.currentTarget.click()
              }
            },
          }
        : {})}
    >
      {top_right_icon ? (
        <DynamicIcon
          icon={top_right_icon}
          className={cn(
            "absolute top-2 left-2 hidden size-4 @min-[9rem]:block",
            TEXT_TONE[tone],
          )}
        />
      ) : null}

      {status ? (
        <StatusDot
          status={status}
          warning={tone === "warning"}
          className="absolute top-2 right-2"
        />
      ) : null}

      {/* Always takes its line, so the title stays centred. */}
      <div
        ref={topRef}
        className={cn(
          "h-4 w-full shrink-0 overflow-hidden px-3.5 text-center font-display text-xs leading-4 font-semibold whitespace-nowrap md:h-5 md:text-sm md:leading-5 @min-[9rem]:px-4",
          TEXT_TONE[tone],
          // Left out, not cut off.
          (!topFits || height === "short") && "invisible h-0 md:h-0",
        )}
      >
        {top_text}
      </div>

      {title ? (
        // Measures titles in the title's font. The text comes from a
        // pseudo-element so it is not part of the page's text.
        <div
          ref={measureRef}
          aria-hidden
          className={cn(
            "pointer-events-none invisible absolute top-0 left-0 text-center text-balance before:content-[attr(data-text)]",
            TITLE_CLASS,
          )}
        />
      ) : null}

      <div
        ref={middleRef}
        className="flex min-h-0 w-full grow items-center justify-center overflow-hidden"
      >
        {content}
      </div>

      {prominent ? (
        <div
          data-testid={tone === "warning" ? "tile-warning" : undefined}
          title={bottom_detail}
          className={cn(
            "max-w-full shrink-0 text-center font-display text-xs leading-4 font-semibold text-balance @min-[9rem]:text-sm @min-[9rem]:leading-5 @min-[14rem]:text-lg @min-[14rem]:leading-6",
            height === "short" ? "line-clamp-2" : "line-clamp-3",
            "@min-[14rem]:line-clamp-2",
            TEXT_TONE[tone],
          )}
        >
          {ToneIcon && bottom_text ? (
            <ToneIcon
              aria-hidden
              className="mr-1 hidden size-4 align-[-0.15em] @min-[9rem]:inline @min-[14rem]:size-5"
            />
          ) : null}
          {bottom_text}
        </div>
      ) : (
        <div
          className={cn(
            "flex max-w-full shrink-0 flex-wrap justify-center gap-x-2 overflow-hidden font-display text-xs leading-4 md:text-sm md:leading-5",
            height === "tall" ? "max-h-8 md:max-h-10" : "max-h-4 md:max-h-5",
            TEXT_TONE[tone],
          )}
        >
          {values.map((value, index) => (
            <Fragment key={index}>
              {index > 0 ? <span className="sr-only"> · </span> : null}
              <span className="whitespace-nowrap">{value}</span>
            </Fragment>
          ))}
        </div>
      )}

      {children}

      {statusLine && statusLine.length > 0 ? (
        <div className="absolute bottom-0 left-0 flex h-1 w-full divide-x-2 divide-emerald-700 dark:divide-emerald-950">
          {statusLine.map((tone, index) => (
            <div
              key={index}
              className={cn("h-full grow", {
                "bg-gradient-to-b from-green-500 to-green-600 dark:from-green-600 dark:to-green-700":
                  tone === "ok",
                "bg-gradient-to-b from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600":
                  tone === "warning",
                "bg-gradient-to-b from-rose-500 to-rose-600 dark:from-rose-600 dark:to-rose-700":
                  tone === "down",
                "bg-gradient-to-b from-stone-400 to-stone-500 dark:from-stone-500 dark:to-stone-600":
                  tone === "unknown",
              })}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
