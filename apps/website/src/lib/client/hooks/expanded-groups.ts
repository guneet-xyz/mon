"use client"

import { useCallback, useMemo, useState } from "react"

import type { PublicGroupTile } from "@mon/config/schema"

// Remembers each group the browser has toggled. Groups never toggled here
// follow their configured initial_state. Each board has its own origin, so
// boards never share this.
const STORAGE_KEY = "mon:group-states"
// v0.4.0-v0.6.0 stored only the expanded groups, as an array of keys.
const LEGACY_STORAGE_KEY = "mon:expanded-groups"

type GroupState = PublicGroupTile["initial_state"]
type Choices = Record<string, GroupState>

function isGroupState(value: unknown): value is GroupState {
  return value === "expanded" || value === "collapsed"
}

function readChoices(): Choices {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    )
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      return Object.fromEntries(
        Object.entries(stored).filter(([, state]) => isGroupState(state)),
      )
    }
    const legacy: unknown = JSON.parse(
      window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]",
    )
    return Object.fromEntries(
      (Array.isArray(legacy) ? legacy : [])
        .filter((key): key is string => typeof key === "string")
        .map((key) => [key, "expanded"]),
    )
  } catch {
    return {}
  }
}

export function useExpandedGroups(
  groups: Readonly<Record<string, PublicGroupTile>>,
) {
  const [choices, setChoices] = useState(readChoices)

  const expanded = useMemo(
    () =>
      new Set(
        Object.values(groups)
          .filter(
            (group) =>
              (choices[group.key] ?? group.initial_state) === "expanded",
          )
          .map((group) => group.key),
      ),
    [groups, choices],
  )

  const toggle = useCallback(
    (key: string) => {
      setChoices((current) => {
        const state = current[key] ?? groups[key]?.initial_state ?? "collapsed"
        const next: Choices = {
          ...current,
          [key]: state === "expanded" ? "collapsed" : "expanded",
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Storage can be unavailable (private mode, quota); keep it in memory.
        }
        return next
      })
    },
    [groups],
  )

  return { expanded, toggle }
}
