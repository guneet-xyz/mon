import { ZodError } from "zod"

import { getAgentAssignments } from "@mon/config/schema"
import { SystemPingDTOSchema, type SystemPingDTO } from "@mon/contracts"

import { verifyBearerToken } from "@/lib/server/agent-auth"
import { getCachedConfig } from "@/lib/server/config-cache"
import { insertSystemPing } from "@/lib/server/ingest/system"

export async function POST(request: Request): Promise<Response> {
  const config = await getCachedConfig()
  const auth = verifyBearerToken(request, config)
  if ("error" in auth) return new Response(null, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: "invalid_payload", issues: ["invalid JSON"] },
      { status: 400 },
    )
  }

  let dto: SystemPingDTO
  try {
    dto = SystemPingDTOSchema.parse(body)
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json(
        { error: "invalid_payload", issues: e.issues },
        { status: 400 },
      )
    }
    throw e
  }

  // An agent reports only its own machine: the tile must be assigned to it.
  const assigned = getAgentAssignments(config, auth.agentId).some(
    (tile) => tile.type === "agent" && tile.key === dto.key,
  )
  if (dto.agent_id !== auth.agentId || !assigned) {
    return new Response(null, { status: 403 })
  }

  const result = await insertSystemPing(dto)
  return Response.json({ ok: true, deduplicated: result.deduplicated })
}
