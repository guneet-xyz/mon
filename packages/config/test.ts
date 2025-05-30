// check config for obvious errors
import { Config } from "./schema"

export async function testConfigForErrors(
  config: Config,
): Promise<"duplicate-host" | null> {
  if (
    config.hosts.map((h) => h.key).length !==
    new Set(config.hosts.map((h) => h.key)).size
  ) {
    return "duplicate-host"
  }

  return null
}
