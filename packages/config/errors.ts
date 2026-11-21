import { TomlError } from "smol-toml"
import { z } from "zod/v4"

export interface ConfigErrorDescription {
  // One line that names where the problem is but quotes nothing from the
  // file, so it is safe to show on a public board.
  summary: string
  // For the server log: each problem with its location and message.
  details: string[]
}

const MAX_DETAIL_LENGTH = 300

function firstLine(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? ""
  return line.length > MAX_DETAIL_LENGTH
    ? `${line.slice(0, MAX_DETAIL_LENGTH)}…`
    : line
}

// Describes a getConfig() failure without echoing the file. smol-toml's
// messages include a snippet of the offending lines (which may hold a
// github_token), so only their first line is kept. Zod issue messages never
// include the input value.
export function describeConfigError(error: unknown): ConfigErrorDescription {
  if (error instanceof TomlError) {
    return {
      summary: `Invalid TOML at line ${error.line}, column ${error.column}`,
      details: [firstLine(error.message)],
    }
  }
  if (error instanceof z.ZodError) {
    const count = error.issues.length
    return {
      summary: `The config doesn't match the schema (${count} ${count === 1 ? "problem" : "problems"})`,
      details: error.issues.map(
        (issue) =>
          `${issue.path.map(String).join(".") || "(root)"}: ${firstLine(issue.message)}`,
      ),
    }
  }
  return {
    summary: "The config file couldn't be read",
    details: [
      firstLine(error instanceof Error ? error.message : String(error)),
    ],
  }
}
