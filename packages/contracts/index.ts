import { z } from "zod"

// ─── Job Tile shapes (daemon-visible subset; website maps config tiles → these) ───

export const HostJobTileSchema = z.object({
  kind: z.literal("host"),
  id: z.string(),
  cron: z.string(),
  address: z.string(),
})

export const WebsiteJobTileSchema = z.object({
  kind: z.literal("website"),
  id: z.string(),
  cron: z.string(),
  url: z.string(),
})

export const ContainerJobTileSchema = z.object({
  kind: z.literal("container"),
  id: z.string(),
  cron: z.string(),
  container_name: z.string(),
  docker_socket: z.string().optional(),
})

export const GithubJobTileSchema = z.object({
  kind: z.literal("github"),
  id: z.string(),
  cron: z.string(),
  repo: z.string(),
  github_token: z.string().optional(),
})

export const JobTileSchema = z.discriminatedUnion("kind", [
  HostJobTileSchema,
  WebsiteJobTileSchema,
  ContainerJobTileSchema,
  GithubJobTileSchema,
])

export const JobsResponseSchema = z.object({
  tiles: z.array(JobTileSchema),
})

// ─── Ping DTOs (daemon → website wire format) ───

export const HostPingDTOSchema = z.object({
  kind: z.literal("host"),
  ping_id: z.string().uuid(),
  daemon_id: z.string().min(1),
  recorded_at: z.string().datetime(),
  key: z.string(),
  latency_ms: z.number().nullable(),
  error: z.string().nullable(),
})

export const WebsitePingDTOSchema = z.object({
  kind: z.literal("website"),
  ping_id: z.string().uuid(),
  daemon_id: z.string().min(1),
  recorded_at: z.string().datetime(),
  key: z.string(),
  latency_ms: z.number().nullable(),
  error: z.string().nullable(),
})

export const ContainerPingDTOSchema = z.object({
  kind: z.literal("container"),
  ping_id: z.string().uuid(),
  daemon_id: z.string().min(1),
  recorded_at: z.string().datetime(),
  key: z.string(),
  // no latency_ms — container_ping table has no latency column
  error: z.string().nullable(),
})

export const GithubPingDTOSchema = z
  .object({
    kind: z.literal("github_ping"),
    ping_id: z.string().uuid(),
    daemon_id: z.string().min(1),
    recorded_at: z.string().datetime(),
    key: z.string(),
    commit_hash: z.string().nullable(),
    // check_run_id is GitHub's bigint check-run ID (FK → githubCheckRun.id after T3 migration)
    check_run_id: z.number().nullable(),
    error: z.string().nullable(),
  })
  .refine(
    (d) =>
      (d.commit_hash !== null && d.check_run_id !== null) || d.error !== null,
    {
      message: "Either (commit_hash + check_run_id) or error must be non-null",
    },
  )

export const GithubCheckRunDTOSchema = z.object({
  kind: z.literal("github_check_run"),
  ping_id: z.string().uuid(),
  daemon_id: z.string().min(1),
  recorded_at: z.string().datetime(),
  key: z.string(),
  id: z.number(), // GitHub's check-run ID (bigint)
  name: z.string(),
  // Enums must match ghCheckRunStatusEnum and ghCheckRunConclusionEnum in packages/db/schema.ts
  status: z.enum([
    "queued",
    "in_progress",
    "completed",
    "waiting",
    "requested",
    "pending",
  ]),
  conclusion: z
    .enum([
      "success",
      "failure",
      "neutral",
      "cancelled",
      "skipped",
      "timed_out",
      "action_required",
    ])
    .nullable(),
  details_url: z.string().nullable(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
})

// ─── Ingest responses ───

export const IngestSuccessResponseSchema = z.object({
  ok: z.literal(true),
  deduplicated: z.boolean(),
})

export const IngestErrorResponseSchema = z.object({
  error: z.string(),
})

// ─── Inferred TypeScript types ───

export type HostJobTile = z.infer<typeof HostJobTileSchema>
export type WebsiteJobTile = z.infer<typeof WebsiteJobTileSchema>
export type ContainerJobTile = z.infer<typeof ContainerJobTileSchema>
export type GithubJobTile = z.infer<typeof GithubJobTileSchema>
export type JobTile = z.infer<typeof JobTileSchema>
export type JobsResponse = z.infer<typeof JobsResponseSchema>

export type HostPingDTO = z.infer<typeof HostPingDTOSchema>
export type WebsitePingDTO = z.infer<typeof WebsitePingDTOSchema>
export type ContainerPingDTO = z.infer<typeof ContainerPingDTOSchema>
export type GithubPingDTO = z.infer<typeof GithubPingDTOSchema>
export type GithubCheckRunDTO = z.infer<typeof GithubCheckRunDTOSchema>
export type IngestSuccessResponse = z.infer<typeof IngestSuccessResponseSchema>
export type IngestErrorResponse = z.infer<typeof IngestErrorResponseSchema>
