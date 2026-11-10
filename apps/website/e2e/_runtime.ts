import { readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

export interface E2ERuntime {
  databaseUrl: string
  configPath: string
  fixtureName: string
}

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNTIME_FILE = join(HERE, "..", ".e2e-runtime.json")

export function getRuntime(): E2ERuntime {
  try {
    const raw = readFileSync(RUNTIME_FILE, "utf8")
    return JSON.parse(raw) as E2ERuntime
  } catch (err) {
    throw new Error(
      `Run via \`bun run e2e\` — runtime artifact missing at ${RUNTIME_FILE} (${(err as Error).message})`,
    )
  }
}

// The website caches the parsed config for 5s (src/lib/server/config-cache.ts).
// Wait that out after rewriting it, otherwise an agent spawned straight away is
// checked against the previous test's agents, gets a 401 and exits.
const CONFIG_CACHE_SETTLE_MS = 5_500

export async function writeRuntimeConfig(path: string, toml: string) {
  writeFileSync(path, toml)
  await new Promise((r) => setTimeout(r, CONFIG_CACHE_SETTLE_MS))
}
