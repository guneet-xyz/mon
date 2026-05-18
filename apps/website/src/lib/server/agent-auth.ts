import type { Config } from "@mon/config"

import { createHash, timingSafeEqual } from "crypto"

export type AuthResult =
  | { agentId: string }
  | { error: "missing" | "malformed" | "unauthorized" }

// Verify Authorization: Bearer <token> + X-Agent-Id header against config
export function verifyBearerToken(
  request: Request,
  config: Config,
): AuthResult {
  const authHeader = request.headers.get("Authorization")
  const agentId = request.headers.get("X-Agent-Id")

  if (!authHeader || !agentId) return { error: "missing" }

  const parts = authHeader.split(" ")
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return { error: "malformed" }
  }

  const token = parts[1]
  const agent = config.agents?.[agentId]
  if (!agent) return { error: "unauthorized" }

  // Constant-time comparison of sha256(presented) vs stored hash
  const presented = Buffer.from(
    createHash("sha256").update(token).digest("hex"),
    "hex",
  )
  const stored = Buffer.from(agent.token_hash, "hex")
  if (presented.length !== stored.length) return { error: "unauthorized" }
  if (!timingSafeEqual(presented, stored)) return { error: "unauthorized" }

  return { agentId }
}

// Helper for tests and docs: compute the token_hash to store in TOML
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
