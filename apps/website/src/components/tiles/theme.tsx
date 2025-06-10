"use client"

import { useTheme } from "@/lib/client"

import { BaseTile } from "./_base"

export function ThemeTile() {
  const { theme, setTheme } = useTheme()
  return (
    <BaseTile
      title="Won't show up in the grid"
      r_span={1}
      c_span={1}
      icon={theme === "dark" ? "pixelarticons:moon" : "solar:sun-bold-duotone"}
      onClick={() => {
        setTheme(theme === "dark" ? "light" : "dark")
      }}
    />
  )
}
