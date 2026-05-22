#!/usr/bin/env bun
/**
 * E2E test wrapper.
 *
 * Lifecycle (CRITICAL ORDER — Playwright starts webServer BEFORE globalSetup):
 *   1. Start ephemeral Postgres testcontainer (createTestDb).
 *   2. Copy the requested fixture TOML to /tmp/mon-e2e-config.toml.
 *   3. Write apps/website/.env.test.local with DATABASE_URL + CONFIG_PATH + SKIP_ENV_VALIDATION=1
 *      so the Next.js child auto-loads it on NODE_ENV=test.
 *   4. Write apps/website/.e2e-runtime.json so individual e2e specs can read runtime context.
 *   5. Spawn `bunx playwright test ...`.
 *   6. Forward exit code; always tear down container + runtime files in `finally`.
 */
import { createTestDb, fixturePath } from "@mon/test-utils"

import { existsSync, rmSync, writeFileSync, copyFileSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const WEBSITE_DIR = import.meta.dir.endsWith("/scripts")
  ? join(import.meta.dir, "..")
  : import.meta.dir
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)
const TEST_UTILS_DIR = join(REPO_ROOT, "packages", "test-utils")
const TEST_UTILS_BUNDLE = join(TEST_UTILS_DIR, "dist", "index.cjs")

const buildBundle = Bun.spawnSync(
  ["bun", "run", "build"],
  { cwd: TEST_UTILS_DIR, stdout: "pipe", stderr: "pipe" },
)
if (buildBundle.exitCode !== 0 || !existsSync(TEST_UTILS_BUNDLE)) {
  console.error("[run-e2e] failed to build @mon/test-utils CJS bundle")
  console.error(buildBundle.stderr?.toString())
  process.exit(1)
}
const ENV_FILE = join(WEBSITE_DIR, ".env.test.local")
const RUNTIME_FILE = join(WEBSITE_DIR, ".e2e-runtime.json")
const CONFIG_PATH = "/tmp/mon-e2e-config.toml"

const fixtureName = process.env.E2E_FIXTURE ?? "single-github.toml"
const forwardedArgs = process.argv.slice(2)

let testDb: Awaited<ReturnType<typeof createTestDb>> | null = null
let cleanedUp = false

function cleanup(): void {
  if (cleanedUp) return
  cleanedUp = true
  try {
    testDb?.stop()
  } catch {
    // best-effort
  }
  for (const file of [ENV_FILE, RUNTIME_FILE, CONFIG_PATH]) {
    try {
      if (existsSync(file)) rmSync(file, { force: true })
    } catch {
      // best-effort
    }
  }
}

let childProc: ReturnType<typeof Bun.spawn> | null = null

function forwardSignal(signal: "SIGINT" | "SIGTERM") {
  return () => {
    try {
      childProc?.kill(signal)
    } catch {
      // best-effort
    }
    cleanup()
    process.exit(signal === "SIGINT" ? 130 : 143)
  }
}

process.on("SIGINT", forwardSignal("SIGINT"))
process.on("SIGTERM", forwardSignal("SIGTERM"))

let exitCode = 1
try {
  testDb = await createTestDb()

  copyFileSync(fixturePath(fixtureName), CONFIG_PATH)

  writeFileSync(
    ENV_FILE,
    [
      `DATABASE_URL=${testDb.url}`,
      `CONFIG_PATH=${CONFIG_PATH}`,
      `SKIP_ENV_VALIDATION=1`,
      "",
    ].join("\n"),
  )

  writeFileSync(
    RUNTIME_FILE,
    JSON.stringify(
      {
        databaseUrl: testDb.url,
        configPath: CONFIG_PATH,
        fixtureName,
      },
      null,
      2,
    ),
  )

  childProc = Bun.spawn(["bunx", "playwright", "test", ...forwardedArgs], {
    cwd: WEBSITE_DIR,
    env: {
      ...process.env,
      NODE_ENV: "test",
      E2E_PORT: process.env.E2E_PORT ?? "3055",
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  exitCode = await childProc.exited
} catch (err) {
  console.error("[run-e2e] fatal:", err)
  exitCode = 1
} finally {
  cleanup()
}

process.exit(exitCode)
