"use client"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/client"

import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <Button
      onClick={() => {
        setTheme(theme === "dark" ? "light" : "dark")
      }}
    >
      {theme === "dark" ? <Moon /> : <Sun />}
    </Button>
  )
}
