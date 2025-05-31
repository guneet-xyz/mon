import { ThemeToggle } from "./theme-toggle"

import Link from "next/link"

export function Navbar() {
  return (
    <div className="flex items-center justify-between p-2">
      <Link href="/" className="font-display text-4xl font-bold">
        MON
      </Link>
      <ThemeToggle />
    </div>
  )
}
