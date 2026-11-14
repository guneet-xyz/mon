import { readFileSync } from "node:fs"

// The agent's bearer token: AGENT_TOKEN, or else the contents of the file at
// AGENT_TOKEN_FILE (e.g. a Compose secret), so the token need not be in the
// environment. Surrounding whitespace in the file is ignored.
export function resolveAgentToken(
  env: Record<string, string | undefined>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string | undefined {
  if (env.AGENT_TOKEN) return env.AGENT_TOKEN
  const path = env.AGENT_TOKEN_FILE
  if (!path) return undefined
  try {
    return read(path).trim()
  } catch (error) {
    throw new Error(`Cannot read AGENT_TOKEN_FILE ${path}: ${String(error)}`)
  }
}
