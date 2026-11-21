import Link from "next/link"

// Board chrome rather than a monitor: the name without a tile around it.
export function LogoTile({
  r_span: _r_span,
  c_span: _c_span,
}: {
  r_span: number
  c_span: number
}) {
  return (
    <Link
      href="https://mon.guneet.dev"
      className="flex h-full w-full items-center justify-center rounded-xl font-display text-3xl font-bold text-emerald-950 transition-colors outline-none hover:bg-emerald-300/40 focus-visible:ring-4 focus-visible:ring-sky-500 md:text-5xl dark:text-emerald-600 dark:hover:bg-emerald-900/40 dark:focus-visible:ring-sky-400"
    >
      MON
    </Link>
  )
}
