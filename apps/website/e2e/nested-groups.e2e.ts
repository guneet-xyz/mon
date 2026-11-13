import { expect, test } from "@playwright/test"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

const hosts = Array.from(
  { length: 6 },
  (_, i) => `
[[tiles]]
type = "host"
key = "nest-host-${i}"
name = "Nest host ${i}"
address = "192.0.2.${50 + i}"
`,
).join("")

test("nested groups, initial_state and remembered choices", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await writeRuntimeConfig(
    getRuntime().configPath,
    `
[options]
hide_grouped_tiles = true
${hosts}
[[tiles]]
type = "group"
key = "inner"
name = "Inner"
members = ["nest-host-0", "nest-host-1"]

[[tiles]]
type = "group"
key = "outer"
name = "Outer"
initial_state = "expanded"
members = ["inner", "nest-host-2", "nest-host-3"]

[[tiles]]
type = "group"
key = "col-one"
name = "Collapsed One"
members = ["nest-host-4", "nest-host-5"]
`,
  )
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto("/")

  // initial_state = "expanded" opens Outer; Inner is nested inside it and
  // hidden from the main board by hide_grouped_tiles.
  const outer = page.getByTestId("expanded-group").filter({
    has: page.getByRole("button", { name: "Collapse Outer" }),
  })
  await expect(outer).toBeVisible({ timeout: 10_000 })
  await expect(
    outer.getByRole("button", { name: "Expand Inner" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Expand Collapsed One" }),
  ).toBeVisible()
  await expect(page.getByTestId("expanded-group")).toHaveCount(1)

  // A nested group expands inside its parent.
  await outer.getByRole("button", { name: "Expand Inner" }).click()
  const inner = outer.getByTestId("expanded-group")
  await expect(inner).toBeVisible()
  await expect(inner.getByText("Nest host 0", { exact: true })).toBeVisible()
  await expect(inner.getByText("Nest host 1", { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    )
    .toBe(0)
  await testInfo.attach("nested-expanded", {
    body: await page.screenshot(),
    contentType: "image/png",
  })

  // Both survive a reload.
  await page.reload()
  await expect(outer.getByTestId("expanded-group")).toBeVisible({
    timeout: 10_000,
  })

  // Collapsing a group that starts expanded is remembered too.
  await page.getByRole("button", { name: "Collapse Outer" }).click()
  await page.reload()
  await expect(page.getByRole("button", { name: "Expand Outer" })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId("expanded-group")).toHaveCount(0)

  // The v0.4-v0.6 storage format still opens the groups it listed.
  await page.evaluate(() => {
    window.localStorage.clear()
    window.localStorage.setItem(
      "mon:expanded-groups",
      JSON.stringify(["col-one"]),
    )
  })
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Collapse Collapsed One" }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByRole("button", { name: "Collapse Outer" }),
  ).toBeVisible()
})
