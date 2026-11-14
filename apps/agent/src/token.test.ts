import { describe, expect, it } from "bun:test"

import { resolveAgentToken } from "./token"

describe("resolveAgentToken", () => {
  const read = (path: string) => {
    if (path === "/run/secrets/agent_token") return "  file-token\n"
    throw new Error("ENOENT")
  }

  it("prefers AGENT_TOKEN", () => {
    expect(
      resolveAgentToken(
        {
          AGENT_TOKEN: "env-token",
          AGENT_TOKEN_FILE: "/run/secrets/agent_token",
        },
        read,
      ),
    ).toBe("env-token")
  })

  it("reads AGENT_TOKEN_FILE, trimmed", () => {
    expect(
      resolveAgentToken({ AGENT_TOKEN_FILE: "/run/secrets/agent_token" }, read),
    ).toBe("file-token")
  })

  it("leaves a missing token to validation", () => {
    expect(resolveAgentToken({}, read)).toBeUndefined()
  })

  it("fails clearly when the file cannot be read", () => {
    expect(() =>
      resolveAgentToken({ AGENT_TOKEN_FILE: "/nope" }, read),
    ).toThrow("Cannot read AGENT_TOKEN_FILE /nope")
  })
})
