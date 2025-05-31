import { ThemeToggle } from "./theme-toggle"

export function Navbar() {
  return (
    <div className="flex items-center justify-between p-2">
      <div className="font-display text-4xl font-bold">MON</div>
      <ThemeToggle />
    </div>
  )
}
