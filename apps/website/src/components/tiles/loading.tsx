import { BaseTile } from "./_base"

export function LoadingTile({
  r_span,
  c_span,
}: {
  r_span: number
  c_span: number
}) {
  return <BaseTile r_span={r_span} c_span={c_span} />
}
