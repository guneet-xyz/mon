import { expect, test } from "@playwright/test"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

test("tiles show full names when they fit", async ({ page }, testInfo) => {
  await writeRuntimeConfig(
    getRuntime().configPath,
    `
[[tiles]]
type = "host"
key = "name-long"
name = "Audiobookshelf (public)"
address = "192.0.2.20"

[[tiles]]
type = "host"
key = "name-short-name"
name = "Immich machine learning"
short_name = "ML"
address = "192.0.2.21"

[[tiles]]
type = "website"
key = "name-site"
name = "Forgejo"
url = "http://192.0.2.22"

[[tiles]]
type = "container"
key = "name-container"
name = "Nextcloud DB"
container_name = "nextcloud-mariadb"
${Array.from(
  { length: 8 },
  (_, i) => `
[[tiles]]
type = "host"
key = "fill-${i}"
address = "192.0.2.${30 + i}"
`,
).join("")}`,
  )

  // Desktop: every 1x1 tile has room for its full name.
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto("/")
  for (const name of [
    "Audiobookshelf (public)",
    "Immich machine learning",
    "Forgejo",
    "Nextcloud DB",
  ]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible({
      timeout: 10_000,
    })
  }
  await testInfo.attach("desktop", {
    body: await page.screenshot(),
    contentType: "image/png",
  })

  // Phone: 12 tiles make a 5x3 board with ~100 px cells. Long names fall
  // back to short_name, then the initial; names that still fit stay.
  await page.setViewportSize({ width: 360, height: 640 })
  // Full names must not widen the board's columns past the window.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
  await expect(page.getByText("ML", { exact: true })).toBeVisible()
  await expect(page.getByText("A", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Audiobookshelf (public)", { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText("Forgejo", { exact: true })).toBeVisible()
  await testInfo.attach("phone", {
    body: await page.screenshot(),
    contentType: "image/png",
  })
})
