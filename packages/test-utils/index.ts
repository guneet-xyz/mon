import * as schema from "@mon/db/schema"

import { execSync } from "child_process"
import { drizzle } from "drizzle-orm/postgres-js"
import net from "net"
import path from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>
  url: string
  stop: () => void
}

const activeContainers = new Set<string>()
let exitHandlersRegistered = false

function registerExitHandlers() {
  if (exitHandlersRegistered) return
  exitHandlersRegistered = true
  const cleanup = () => {
    for (const name of activeContainers) {
      try {
        execSync(`docker rm -f ${name}`, { stdio: "pipe" })
      } catch {
        // best-effort
      }
    }
    activeContainers.clear()
  }
  process.on("exit", cleanup)
  process.on("SIGINT", () => {
    cleanup()
    process.exit(130)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(143)
  })
  process.on("uncaughtException", (err) => {
    cleanup()
    throw err
  })
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === "object") {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error("could not determine port")))
      }
    })
  })
}

async function waitForPostgres(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  let lastError: unknown = null
  while (Date.now() - start < timeoutMs) {
    try {
      const client = postgres(url, {
        max: 1,
        connect_timeout: 2,
        onnotice: () => {},
      })
      await client`SELECT 1`
      await client.end()
      return
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(
    `Postgres at ${url} not ready after ${timeoutMs}ms: ${String(lastError)}`,
  )
}

function applySchema(url: string): void {
  // packages/db expects DATABASE_URL via @mon/env. We invoke drizzle-kit push
  // with DATABASE_URL pointed at the ephemeral container.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dbPackage = path.resolve(here, "..", "db")
  execSync(`bunx drizzle-kit push --force`, {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  })
}

export async function createTestDb(): Promise<TestDb> {
  registerExitHandlers()

  const port = await getFreePort()
  const containerName = `mon-test-${port}-${Math.random().toString(36).slice(2, 8)}`

  execSync(
    `docker run -d --rm --name ${containerName} -e POSTGRES_PASSWORD=test -e POSTGRES_DB=mon_test -p ${port}:5432 postgres:16`,
    { stdio: "pipe" },
  )
  activeContainers.add(containerName)

  const url = `postgres://postgres:test@localhost:${port}/mon_test`

  try {
    await waitForPostgres(url, 30_000)
    applySchema(url)
  } catch (err) {
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: "pipe" })
    } catch {
      // best-effort
    }
    activeContainers.delete(containerName)
    throw err
  }

  const client = postgres(url, { onnotice: () => {} })
  const db = drizzle(client, { schema })

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      void client.end({ timeout: 2 })
    } catch {
      // best-effort
    }
    try {
      execSync(`docker rm -f ${containerName}`, { stdio: "pipe" })
    } catch {
      // best-effort
    }
    activeContainers.delete(containerName)
  }

  return { db, url, stop }
}

export async function withTestDb<T>(
  fn: (db: TestDb["db"], url: string) => Promise<T>,
): Promise<T> {
  const testDb = await createTestDb()
  try {
    return await fn(testDb.db, testDb.url)
  } finally {
    testDb.stop()
  }
}
