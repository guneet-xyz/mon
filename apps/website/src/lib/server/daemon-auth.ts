import type { Config } from "@mon/config"

import { createHash, timingSafeEqual } from "crypto"

export type AuthResult =
  | { daemonId: string }
  | { error: "missing" | "malformed" | "unauthorized" }

// Verify Authorization: Bearer <token> + X-Daemon-Id header against config
export function verifyBearerToken(
  request: Request,
  config: Config,
): AuthResult {
  const authHeader = request.headers.get("Authorization")
  const daemonId = request.headers.get("X-Daemon-Id")

  if (!authHeader || !daemonId) return { error: "missing" }

  const parts = authHeader.split(" ")
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return { error: "malformed" }
  }

  const token = parts[1]
  const daemon = config.daemons?.[daemonId]
  if (!daemon) return { error: "unauthorized" }

  // Constant-time comparison of sha256(presented) vs stored hash
  const presented = Buffer.from(
    createHash("sha256").update(token).digest("hex"),
    "hex",
  )
  const stored = Buffer.from(daemon.token_hash, "hex")
  if (presented.length !== stored.length) return { error: "unauthorized" }
  if (!timingSafeEqual(presented, stored)) return { error: "unauthorized" }

  return { daemonId }
}

// Helper for tests and docs: compute the token_hash to store in TOML
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
