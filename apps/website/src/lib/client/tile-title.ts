// Tiles show their full name when it fits. If it is slightly too wide it is
// scaled down, but never below MIN_TITLE_SCALE; past that the tile falls back
// to a compact title (short_name, then the icon, then the initial).
export const MIN_TITLE_SCALE = 0.75

// Horizontal room the title must leave free inside the tile, in pixels.
export const TITLE_PADDING_PX = 24

// Scale for a title `needed` px wide in `available` px, or null when it
// should fall back to a compact title.
export function fitTitle(available: number, needed: number): number | null {
  if (needed <= 0) return 1
  const ratio = available / needed
  if (ratio >= 1) return 1
  return ratio >= MIN_TITLE_SCALE ? ratio : null
}

export function initialTitle(title: string): string {
  return title.length > 3 ? title[0]!.toUpperCase() : title
}
