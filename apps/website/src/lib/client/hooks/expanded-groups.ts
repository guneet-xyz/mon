"use client"

import { useCallback, useState } from "react"

// Remembers which groups are expanded across reloads. Each board has its own
// origin, so boards never share this.
const STORAGE_KEY = "mon:expanded-groups"

function readExpandedGroups(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === "string")
        : [],
    )
  } catch {
    return new Set()
  }
}

export function useExpandedGroups() {
  const [expanded, setExpanded] = useState(readExpandedGroups)

  const toggle = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Storage can be unavailable (private mode, quota); keep it in memory.
      }
      return next
    })
  }, [])

  return { expanded, toggle }
}
