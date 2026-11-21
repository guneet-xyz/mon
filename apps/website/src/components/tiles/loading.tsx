import { BaseTile } from "./_base"

export function LoadingTile({
  r_span,
  c_span,
}: {
  r_span: number
  c_span: number
}) {
  return (
    <BaseTile
      r_span={r_span}
      c_span={c_span}
      aria-busy
      data-loading
      className="animate-pulse opacity-70 motion-reduce:animate-none"
    >
      {/* Where the name will be. */}
      <div className="absolute top-1/2 left-1/2 h-3 w-1/2 -translate-1/2 rounded-full bg-emerald-800/20 dark:bg-emerald-200/15" />
    </BaseTile>
  )
}
