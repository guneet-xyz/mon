import { GithubCheckRunDTOSchema, GithubPingDTOSchema } from "@mon/contracts"

import { getCachedConfig } from "@/lib/server/config-cache"
import { verifyBearerToken } from "@/lib/server/daemon-auth"
import {
  insertGithubCheckRun,
  insertGithubPing,
} from "@/lib/server/ingest/github"

import { ZodError, z } from "zod"

const GithubBodySchema = z.union([GithubPingDTOSchema, GithubCheckRunDTOSchema])

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

  let dto: z.infer<typeof GithubBodySchema>
  try {
    dto = GithubBodySchema.parse(body)
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

  let result
  if (dto.kind === "github_ping") {
    result = await insertGithubPing(dto)
  } else {
    result = await insertGithubCheckRun(dto)
  }
  return Response.json({ ok: true, deduplicated: result.deduplicated })
}
