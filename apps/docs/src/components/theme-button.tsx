"use client"

import { DuotoneHoverIcon } from "./duotone-hover-icon"
import { Button } from "./ui/button"

import { useTheme } from "nextra-theme-docs"
import { PiMoon, PiMoonDuotone, PiSun, PiSunDuotone } from "react-icons/pi"

export function ThemeButton() {
  const { theme, setTheme } = useTheme()

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button
      onClick={toggleTheme}
      variant="ghost"
      className="group flex size-8 cursor-pointer items-center justify-center hover:bg-neutral-200"
    >
      {theme === "dark" ? (
        <DuotoneHoverIcon
          regular={<PiMoon className="size-6" />}
          hover={<PiMoonDuotone className="size-6" />}
        />
      ) : (
        <DuotoneHoverIcon
          regular={<PiSun className="size-6" />}
          hover={<PiSunDuotone className="size-6" />}
        />
      )}
    </Button>
  )
}
