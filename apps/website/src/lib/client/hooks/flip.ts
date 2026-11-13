"use client"

import { useLayoutEffect, useRef, type RefObject } from "react"

const DURATION_MS = 320
const EASING = "cubic-bezier(0.2, 0, 0, 1)"

// FLIP animation for the board's tiles, including tiles inside expanded
// groups. After each render it measures every element with a `data-flip-id`
// and, when `trigger` changed (a group was expanded or collapsed), animates
// each tile from its previous rect. A nested tile moves relative to the tile
// that contains it, so it is not animated twice when its parent moves:
// - an expanding group is revealed from its old area with a clip, so its
//   content is never stretched,
// - a collapsing group scales down from its old size while fading in,
// - other tiles slide (and resize, if the board's columns changed) from
//   their old rect,
// - new tiles fade in (tiles inside a group use their own CSS entrance).
// Window resizes update the measurements without animating.
export function useFlipAnimation(
  ref: RefObject<HTMLElement | null>,
  trigger: string,
) {
  const rects = useRef(new Map<string, DOMRect>())
  const lastTrigger = useRef(trigger)

  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid) return
    const animate =
      lastTrigger.current !== trigger &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    lastTrigger.current = trigger

    const next = new Map<string, DOMRect>()
    // Document order: a tile is always measured before the tiles inside it.
    for (const child of Array.from(
      grid.querySelectorAll<HTMLElement>("[data-flip-id]"),
    )) {
      const id = child.dataset.flipId
      if (!id) continue
      for (const running of child.getAnimations()) {
        if (!(running instanceof CSSAnimation)) running.cancel()
      }

      const rect = child.getBoundingClientRect()
      next.set(id, rect)
      if (!animate) continue

      const parentId =
        child.parentElement?.closest<HTMLElement>("[data-flip-id]")?.dataset
          .flipId
      let prev = rects.current.get(id)
      if (prev && parentId) {
        const parentPrev = rects.current.get(parentId)
        const parentNow = next.get(parentId)
        if (parentPrev && parentNow) {
          prev = new DOMRect(
            prev.x - parentPrev.x + parentNow.x,
            prev.y - parentPrev.y + parentNow.y,
            prev.width,
            prev.height,
          )
        }
      }
      const options = { duration: DURATION_MS, easing: EASING }
      if (!prev) {
        if (parentId) continue
        child.animate(
          [
            { opacity: 0, transform: "scale(0.92)" },
            { opacity: 1, transform: "none" },
          ],
          options,
        )
        continue
      }

      const dx = prev.left - rect.left
      const dy = prev.top - rect.top
      const sx = prev.width / rect.width
      const sy = prev.height / rect.height
      const growth = (rect.width * rect.height) / (prev.width * prev.height)

      if (growth > 1.6) {
        // An expanding group: reveal it from the area it used to occupy.
        const inset = [
          Math.max(0, dy),
          Math.max(0, rect.right - prev.right),
          Math.max(0, rect.bottom - prev.bottom),
          Math.max(0, dx),
        ]
        child.animate(
          [
            { clipPath: `inset(${inset.join("px ")}px round 0.75rem)` },
            { clipPath: "inset(0px 0px 0px 0px round 0.75rem)" },
          ],
          options,
        )
      } else if (
        Math.abs(dx) > 0.5 ||
        Math.abs(dy) > 0.5 ||
        Math.abs(sx - 1) > 0.01 ||
        Math.abs(sy - 1) > 0.01
      ) {
        // Moved or resized tiles slide from their old rect; a collapsing
        // group also fades in, since its old size was much larger.
        child.animate(
          [
            {
              transformOrigin: "top left",
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
              opacity: growth < 0.625 ? 0.3 : 1,
            },
            { transformOrigin: "top left", transform: "none", opacity: 1 },
          ],
          options,
        )
      }
    }
    rects.current = next
  })
}
