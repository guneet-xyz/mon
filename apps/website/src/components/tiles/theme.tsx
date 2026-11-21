"use client"

import { DynamicIcon } from "@/components/dynamic-icon"
import { useTheme } from "@/lib/client"

// Board chrome rather than a monitor, so it is a plain button, not a tile.
export function ThemeTile() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex h-full w-full items-center justify-center">
      <button
        type="button"
        aria-label={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        onClick={() => {
          setTheme(theme === "dark" ? "light" : "dark")
        }}
        className="flex size-12 cursor-pointer items-center justify-center rounded-full text-emerald-950 transition-colors outline-none hover:bg-emerald-300/60 focus-visible:ring-4 focus-visible:ring-sky-500 dark:text-emerald-200 dark:hover:bg-emerald-900/60 dark:focus-visible:ring-sky-400"
      >
        <DynamicIcon
          icon={
            theme === "dark" ? "pixelarticons:moon" : "solar:sun-bold-duotone"
          }
          className="size-6"
        />
      </button>
    </div>
  )
}
