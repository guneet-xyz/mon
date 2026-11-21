import { describe, expect, test } from "bun:test"
import { parse } from "smol-toml"

import { describeConfigError } from "./errors"
import { ConfigSchema } from "./schema"

const SECRET = "ghp_supersecrettokenvalue"

function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error("expected a throw")
}

describe("describeConfigError", () => {
  test("names the line and column of a TOML error without quoting the file", () => {
    const error = thrown(() =>
      parse(`[[tiles]]\ntype = "github"\ngithub_token = "${SECRET}\n`),
    )
    expect(String(error)).toContain(SECRET)

    const { summary, details } = describeConfigError(error)
    expect(summary).toMatch(/^Invalid TOML at line 3, column \d+$/)
    expect(details).toHaveLength(1)
    expect(details[0]).toStartWith("Invalid TOML document")
    expect([summary, ...details].join("\n")).not.toContain(SECRET)
  })

  test("lists each schema problem by path", () => {
    const error = thrown(() =>
      ConfigSchema.parse({
        agents: { default: { token_hash: SECRET } },
        tiles: [{ type: "host", key: "router" }],
      }),
    )

    const { summary, details } = describeConfigError(error)
    expect(summary).toBe("The config doesn't match the schema (2 problems)")
    expect(details).toHaveLength(2)
    expect(details[0]).toStartWith("agents.default.token_hash: ")
    expect(details[1]).toStartWith("tiles.0.address: ")
    expect(details.join("\n")).not.toContain(SECRET)
  })

  test("uses the singular for one problem", () => {
    const error = thrown(() =>
      ConfigSchema.parse({ tiles: [{ type: "host", key: "router" }] }),
    )
    expect(describeConfigError(error).summary).toBe(
      "The config doesn't match the schema (1 problem)",
    )
  })

  test("describes other errors by the first line of their message", () => {
    const { summary, details } = describeConfigError(
      new Error("EACCES: permission denied\nmore"),
    )
    expect(summary).toBe("The config file couldn't be read")
    expect(details).toEqual(["EACCES: permission denied"])
  })
})
