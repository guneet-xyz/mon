import { BaseTile } from "./_base"

import Link from "next/link"

export function LogoTile({
  r_span,
  c_span,
}: {
  r_span: number
  c_span: number
}) {
  return (
    <Link href="https://github.com/guneet-xyz/mon">
      <BaseTile
        r_span={r_span}
        c_span={c_span}
        title="MON"
        className="relative overflow-hidden font-bold *:text-5xl dark:bg-emerald-950 *:dark:text-emerald-700 dark:hover:bg-emerald-950"
      />
    </Link>
  )
}
