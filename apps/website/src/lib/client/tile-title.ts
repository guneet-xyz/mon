// Tiles show their full name when it fits, wrapped at spaces. If a word is
// too wide (or the lines too tall) the name is scaled down, but never below
// MIN_TITLE_SCALE; past that the tile falls back to short_name, then the
// icon, then the full name smaller still (SQUEEZE_SCALES), and only then
// broken inside words.
export const MIN_TITLE_SCALE = 0.75

// Scales tried in turn, largest first.
export const TITLE_SCALES = [1, 0.9, 0.8, MIN_TITLE_SCALE]

// Last resort before breaking words, for names without short_name or icon.
export const SQUEEZE_SCALES = [0.7, 0.6]

// Horizontal room the title must leave free inside the tile, in pixels.
export const TITLE_PADDING_PX = 16

// Vertical tiles (one column, several rows) fall back to the initial.
export function initialTitle(title: string): string {
  return title.length > 3 ? title[0]!.toUpperCase() : title
}
