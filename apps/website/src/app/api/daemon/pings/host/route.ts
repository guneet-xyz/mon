import { type HostPingDTO, HostPingDTOSchema } from "@mon/contracts"

import { getCachedConfig } from "@/lib/server/config-cache"
import { verifyBearerToken } from "@/lib/server/daemon-auth"
import { insertHostPing } from "@/lib/server/ingest/host"

import { ZodError } from "zod"

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

  let dto: HostPingDTO
  try {
    dto = HostPingDTOSchema.parse(body)
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json(
        { error: "invalid_payload", issues: e.issues },
        { status: 400 },
      )
    }
    throw e
  }

  if (dto.daemon_id !== auth.daemonId) {
    return new Response(null, { status: 403 })
  }

  const result = await insertHostPing(dto)
  return Response.json({ ok: true, deduplicated: result.deduplicated })
}
