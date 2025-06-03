"use client"

import { useTheme as _useTheme } from "next-themes"

export function useTheme() {
  const { theme, setTheme: _setTheme } = _useTheme()
  return {
    theme: theme === "dark" ? ("dark" as const) : ("light" as const),
    setTheme: _setTheme,
  }
}
