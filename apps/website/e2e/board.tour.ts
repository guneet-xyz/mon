import { mkdirSync, rmSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { test, type Page } from "@playwright/test"
import postgres from "postgres"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

// A representative board, seeded straight into the database (no agents run):
// healthy, warning, down and silent monitors of every kind, nested groups and
// a long name. Screenshots go to SCREENSHOTS_DIR (default .screenshots/).
const OUT =
  process.env.SCREENSHOTS_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "..", ".screenshots")

const CONFIG = `
[options]
hide_grouped_tiles = true

[[tiles]]
type = "logo"

[[tiles]]
type = "theme"

[[tiles]]
type = "group"
key = "grp-machines"
name = "Machines"
icon = "mdi:server"
initial_state = "expanded"
members = ["agent-alpha", "agent-beta", "agent-gamma"]

[tiles.expanded]
row_span = 1
col_span = 3

[[tiles]]
type = "group"
key = "grp-websites"
name = "Websites"
icon = "mdi:web"
initial_state = "expanded"
members = ["site-ok", "site-cert", "site-down", "site-long"]

[[tiles]]
type = "group"
key = "grp-services"
name = "Services"
icon = "mdi:apps"
members = ["grp-app", "grp-cache"]

[[tiles]]
type = "group"
key = "grp-app"
name = "App"
members = ["site-ok", "ctr-app", "ctr-db"]

[[tiles]]
type = "group"
key = "grp-cache"
name = "Cache"
members = ["ctr-cache"]

[[tiles]]
type = "host"
key = "host-router"
name = "Router"
address = "192.0.2.1"

[[tiles]]
type = "agent"
key = "agent-alpha"
name = "Alpha"
agent = "alpha"
disks = [{ path = "/", name = "/" }, { path = "/mnt", name = "/mnt" }]

[[tiles]]
type = "agent"
key = "agent-beta"
name = "Beta"
agent = "beta"
disks = [{ path = "/", name = "/" }]

[[tiles]]
type = "agent"
key = "agent-gamma"
name = "Gamma"
agent = "gamma"

[[tiles]]
type = "website"
key = "site-ok"
name = "Website"
url = "https://example.com"

[[tiles]]
type = "website"
key = "site-cert"
name = "Expiring cert"
url = "https://cert.example.com"

[[tiles]]
type = "website"
key = "site-down"
name = "Down site"
url = "https://down.example.com"

[[tiles]]
type = "website"
key = "site-long"
name = "Audiobookshelf (public mirror)"
url = "https://books.example.com"

[[tiles]]
type = "container"
key = "ctr-app"
name = "App server"
container_name = "app"

[[tiles]]
type = "container"
key = "ctr-db"
name = "App database"
container_name = "app-db"

[[tiles]]
type = "container"
key = "ctr-cache"
name = "Cache"
container_name = "cache"
`

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

async function seed(sql: postgres.Sql) {
  const now = Date.now()
  // Every 10 minutes for the last day; the newest is 20 s old, so fresh.
  const times = Array.from(
    { length: 144 },
    (_, i) => new Date(now - 20_000 - i * 600_000),
  )
  const wave = (i: number, base: number, amp: number) =>
    base + amp * Math.sin(i / 9)

  for (const [i, t] of times.entries()) {
    await sql`insert into mon_host_ping (key, agent_id, timestamp, latency, error)
      values ('host-router', 'alpha', ${t}, ${i > 0 && i % 37 === 0 ? null : wave(i, 3, 1)}, ${i > 0 && i % 37 === 0 ? "timeout" : null})`
    for (const [key, base, extra] of [
      ["site-ok", 120, { status: 200, cert: now + 60 * DAY, error: null }],
      ["site-cert", 240, { status: 200, cert: now + 5 * DAY, error: null }],
      [
        "site-down",
        0,
        { status: 503, cert: now + 40 * DAY, error: i < 6 ? "HTTP 503" : null },
      ],
      ["site-long", 90, { status: 302, cert: now + 80 * DAY, error: null }],
    ] as const) {
      await sql`insert into mon_website_ping (key, agent_id, timestamp, latency, error, status_code, cert_expires_at, redirect_location)
        values (${key}, 'alpha', ${t}, ${extra.error ? null : wave(i, base || 150, 30)}, ${extra.error},
          ${extra.error ? 503 : extra.status === 503 ? 200 : extra.status}, ${new Date(extra.cert)}, ${extra.status === 302 ? "/login" : null})`
    }
    for (const [key, health, cpu, mem, restarts] of [
      ["ctr-app", "healthy", 12, 350e6, 0],
      ["ctr-db", "healthy", 4, 220e6, 0],
      ["ctr-cache", i < 3 ? "unhealthy" : "healthy", 1, 40e6, i < 50 ? 3 : 1],
    ] as const) {
      await sql`insert into mon_container_ping (key, agent_id, timestamp, error, state, health, restart_count, started_at, exit_code, oom_killed, image, image_version, cpu_percent, memory_bytes, memory_limit_bytes)
        values (${key}, 'alpha', ${t}, null, 'running', ${health}, ${restarts}, ${new Date(now - 6 * DAY)}, 0, false,
          ${`registry.example.com/${key}:1.4.2`}, '1.4.2', ${wave(i, cpu, cpu / 3)}, ${mem}, ${2e9})`
    }
    for (const [key, cpu, mem, disks, silent] of [
      [
        "agent-alpha",
        18,
        0.47,
        [
          ["/", 0.62],
          ["/mnt", 0.39],
        ],
        false,
      ],
      ["agent-beta", 7, 0.81, [["/", 0.93]], false],
      ["agent-gamma", 3, 0.3, [], true],
    ] as const) {
      // Agents report every minute; one report per 5-minute interval is
      // enough for their uptime. Gamma stopped reporting 25 minutes ago.
      for (const at of [t, new Date(t.getTime() - 300_000)]) {
        if (silent && now - at.getTime() < 25 * 60_000) continue
        await sql`insert into mon_system_ping (key, agent_id, timestamp, error, cpu_percent, memory_bytes, memory_total_bytes, uptime_seconds, disks)
        values (${key}, ${key.slice(6)}, ${at}, null, ${wave(i, cpu, cpu / 2)}, ${Math.round(mem * 8e9)}, ${8e9},
          ${Math.round((5 * DAY - (now - at.getTime())) / 1000)},
          ${sql.json(disks.map(([name, used]) => ({ name, usedBytes: Math.round(used * 100e9), totalBytes: 100e9 })))})`
      }
    }
  }
}

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
}

async function open(
  page: Page,
  theme: "light" | "dark",
  groups: Record<string, string> = {},
) {
  await page.addInitScript(
    ([t, g]) => {
      localStorage.setItem("theme", t as string)
      localStorage.setItem("mon:group-states", JSON.stringify(g))
    },
    [theme, groups],
  )
  // Deterministic shots: no transitions mid-capture.
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme })
  await page.goto("/")
  await page.getByText("Machines").first().waitFor()
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(800)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

test("board tour", async ({ browser }) => {
  test.setTimeout(240_000)
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const runtime = getRuntime()
  const sql = postgres(runtime.databaseUrl, { onnotice: () => undefined })
  await seed(sql)
  await sql.end()
  await writeRuntimeConfig(runtime.configPath, CONFIG)

  let n = 0
  const next = () => String(++n).padStart(2, "0")

  for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of ["light", "dark"] as const) {
      const page = await browser.newPage({ viewport })
      await open(page, theme)
      await shot(page, `${next()}-board-${size}-${theme}`)
      await page.close()
    }
  }

  const page = await browser.newPage({ viewport: VIEWPORTS.desktop })
  await open(page, "light", {
    "grp-services": "expanded",
    "grp-app": "expanded",
  })
  await shot(page, `${next()}-services-nested-expanded`)

  for (const name of ["Beta", "Expiring cert", "App server", "Gamma"]) {
    await page.getByText(name, { exact: true }).first().click()
    await page.getByRole("dialog").waitFor()
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(600)
    await shot(
      page,
      `${next()}-dialog-${name.toLowerCase().replace(/\W+/g, "-")}`,
    )
    await page.keyboard.press("Escape")
  }

  const dark = await browser.newPage({ viewport: VIEWPORTS.desktop })
  await open(dark, "dark")
  await dark.getByText("Beta", { exact: true }).first().click()
  await dark.getByRole("dialog").waitFor()
  await dark.waitForLoadState("networkidle")
  await dark.waitForTimeout(600)
  await shot(dark, `${next()}-dialog-beta-dark`)

  console.log(`[tour] ${n} screenshots in ${OUT}`)
})
