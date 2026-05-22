import * as schema from "@mon/db/schema"

import { execSync } from "child_process"
import { drizzle } from "drizzle-orm/postgres-js"
import net from "net"
import path from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

export { fixturePath } from "./fixtures/index"

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>
  url: string
  stop: () => void
}

const activeContainers = new Set<string>()
const activeServers = new Set<{ stop: () => void | Promise<void> }>()
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
    for (const server of activeServers) {
      try {
        void server.stop()
      } catch {
        // best-effort
      }
    }
    activeServers.clear()
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
  // drizzle-kit reads DATABASE_URL from process.env; point it at the ephemeral container.
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

export type HttpScenario =
  | { kind: "ok"; status: 200; body?: string }
  | { kind: "redirect"; status: 301 | 302; location: string }
  | { kind: "server_error"; status: 500 | 502 | 503 }
  | { kind: "slow"; delayMs: number }
  | { kind: "tcp_reset" }
  | { kind: "no_response" }

export interface MockHttpHost {
  url: string
  setScenario(s: HttpScenario): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}

export async function createMockHttpHost(opts?: {
  port?: number
}): Promise<MockHttpHost> {
  registerExitHandlers()

  const port = opts?.port ?? (await getFreePort())
  const requests: Array<{ method: string; path: string }> = []
  let scenario: HttpScenario = { kind: "ok", status: 200 }

  // Raw TCP so tcp_reset/no_response scenarios are expressible.
  const sockets = new Set<import("net").Socket>()
  const tcpServer = net.createServer((socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
    socket.on("error", () => {
      sockets.delete(socket)
    })

    let buf = ""
    socket.on("data", async (chunk) => {
      buf += chunk.toString("utf8")
      const headerEnd = buf.indexOf("\r\n\r\n")
      if (headerEnd === -1) return

      const head = buf.slice(0, headerEnd)
      const requestLine = head.split("\r\n")[0] ?? ""
      const [method = "GET", rawPath = "/"] = requestLine.split(" ")
      requests.push({ method, path: rawPath })

      const current = scenario
      buf = ""

      if (current.kind === "no_response") {
        // accept but never respond
        return
      }
      if (current.kind === "tcp_reset") {
        // forcibly close with RST
        try {
          socket.resetAndDestroy()
        } catch {
          socket.destroy()
        }
        return
      }
      if (current.kind === "slow") {
        await new Promise((r) => setTimeout(r, current.delayMs))
        if (socket.destroyed) return
        writeHttpResponse(socket, 200, { "content-length": "2" }, "ok")
        return
      }
      if (current.kind === "redirect") {
        writeHttpResponse(
          socket,
          current.status,
          {
            location: current.location,
            "content-length": "0",
          },
          "",
        )
        return
      }
      if (current.kind === "server_error") {
        const body = `error ${current.status}`
        writeHttpResponse(
          socket,
          current.status,
          { "content-length": String(Buffer.byteLength(body)) },
          method === "HEAD" ? "" : body,
        )
        return
      }
      // ok
      const body = current.body ?? "ok"
      writeHttpResponse(
        socket,
        current.status,
        { "content-length": String(Buffer.byteLength(body)) },
        method === "HEAD" ? "" : body,
      )
    })
  })

  await new Promise<void>((resolve, reject) => {
    tcpServer.once("error", reject)
    tcpServer.listen(port, "127.0.0.1", () => resolve())
  })

  let stopped = false
  const handle = {
    stop: async () => {
      if (stopped) return
      stopped = true
      for (const s of sockets) {
        try {
          s.destroy()
        } catch {
          // best-effort
        }
      }
      sockets.clear()
      await new Promise<void>((resolve) => {
        tcpServer.close(() => resolve())
      })
      activeServers.delete(handle)
    },
  }
  activeServers.add(handle)

  return {
    url: `http://127.0.0.1:${port}`,
    setScenario(s: HttpScenario) {
      scenario = s
    },
    requests,
    stop: handle.stop,
  }
}

function writeHttpResponse(
  socket: import("net").Socket,
  status: number,
  headers: Record<string, string>,
  body: string,
): void {
  const statusText = HTTP_STATUS_TEXT[status] ?? "OK"
  const headerLines = Object.entries({
    connection: "close",
    ...headers,
  })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n")
  const payload = `HTTP/1.1 ${status} ${statusText}\r\n${headerLines}\r\n\r\n${body}`
  try {
    socket.write(payload, () => {
      socket.end()
    })
  } catch {
    // best-effort
  }
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: "OK",
  301: "Moved Permanently",
  302: "Found",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
}

export interface MockCheckRun {
  id: number
  name: string
  status:
    | "queued"
    | "in_progress"
    | "completed"
    | "waiting"
    | "requested"
    | "pending"
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null
  details_url: string
  started_at: string
  completed_at: string | null
  head_sha: string
}

export type GithubScenario =
  | { kind: "success"; checkRuns: MockCheckRun[] }
  | { kind: "empty" }
  | { kind: "http_error"; status: 500 | 502 | 503 }
  | { kind: "slow"; delayMs: number }
  | { kind: "malformed" }

export interface MockServerRequest {
  method: string
  path: string
  headers: Record<string, string>
}

export interface MockServer {
  url: string
  setScenario(s: GithubScenario): void
  requests: MockServerRequest[]
  stop: () => Promise<void>
}

export async function createMockGithubServer(opts?: {
  port?: number
}): Promise<MockServer> {
  registerExitHandlers()

  const port = opts?.port ?? (await getFreePort())
  const requests: MockServerRequest[] = []
  let scenario: GithubScenario = { kind: "empty" }

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key] = value
      })
      requests.push({
        method: req.method,
        path: url.pathname,
        headers,
      })

      const match = url.pathname.match(
        /^\/repos\/[^/]+\/[^/]+\/commits\/HEAD\/check-runs$/,
      )
      if (!match || req.method !== "GET") {
        return new Response("Not Found", { status: 404 })
      }

      const current: GithubScenario = scenario
      switch (current.kind) {
        case "success":
          return Response.json({ check_runs: current.checkRuns })
        case "empty":
          return Response.json({ check_runs: [] })
        case "http_error":
          return new Response(`error ${current.status}`, {
            status: current.status,
          })
        case "slow": {
          await new Promise((r) => setTimeout(r, current.delayMs))
          return Response.json({ check_runs: [] })
        }
        case "malformed":
          return new Response("not json {{{", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
      }
    },
  })

  let stopped = false
  const entry = {
    stop: async () => {
      if (stopped) return
      stopped = true
      try {
        await server.stop(true)
      } catch {
        // best-effort
      }
      activeServers.delete(entry)
    },
  }
  activeServers.add(entry)

  return {
    url: `http://localhost:${port}`,
    setScenario(s) {
      scenario = s
    },
    requests,
    stop: entry.stop,
  }
}
