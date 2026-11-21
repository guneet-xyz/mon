import { describe, expect, it } from "bun:test"

import { monitorLink } from "./monitor-link"

describe("monitorLink", () => {
  it("links a website to its URL", () => {
    expect(
      monitorLink({
        type: "website",
        url: "https://example.com/",
      }),
    ).toEqual({ href: "https://example.com/", label: "example.com" })
  })

  it("keeps the path in the label", () => {
    expect(
      monitorLink({
        type: "website",
        url: "http://example.com/health",
      }),
    ).toEqual({
      href: "http://example.com/health",
      label: "example.com/health",
    })
  })

  it("does not link non-http URLs or invalid URLs", () => {
    for (const url of ["javascript:alert(1)", "ftp://example.com", "nope"]) {
      expect(monitorLink({ type: "website", url })).toBeNull()
    }
  })

  it("links a GitHub tile to its repository", () => {
    expect(monitorLink({ type: "github", repo: "guneet-xyz/mon" })).toEqual({
      href: "https://github.com/guneet-xyz/mon",
      label: "github.com/guneet-xyz/mon",
    })
  })

  it("has no link for other monitors", () => {
    expect(monitorLink({ type: "host" })).toBeNull()
    expect(monitorLink(undefined)).toBeNull()
  })
})
