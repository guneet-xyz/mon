import { dirname, join } from "path"
import { fileURLToPath } from "url"

export function fixturePath(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, name)
}
