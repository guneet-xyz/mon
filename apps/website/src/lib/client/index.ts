"use client"

import { useTheme as _useTheme } from "next-themes"

export function useTheme() {
  // resolvedTheme follows the system setting until a theme is picked; the
  // pick is saved in localStorage ("theme") by next-themes.
  const { resolvedTheme, setTheme: _setTheme } = _useTheme()
  return {
    theme: resolvedTheme === "dark" ? ("dark" as const) : ("light" as const),
    setTheme: _setTheme,
  }
}
