import { readFileSync } from "fs"
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
