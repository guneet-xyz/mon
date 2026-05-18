import { IngestSuccessResponseSchema, JobsResponseSchema } from "@mon/contracts"
import type {
  ContainerPingDTO,
  GithubCheckRunDTO,
  GithubPingDTO,
  HostPingDTO,
  IngestSuccessResponse,
  WebsitePingDTO,
} from "@mon/contracts"

export class UnauthorizedError extends Error {
  constructor() {
    super("401 Unauthorized from website")
    this.name = "UnauthorizedError"
  }
}

export class UnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Website unreachable")
    this.name = "UnreachableError"
    this.cause = cause
  }
}

type FetchFn = typeof globalThis.fetch

export class WebsiteApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly agentId: string,
    private readonly token: string,
    private readonly fetch: FetchFn = globalThis.fetch.bind(globalThis),
  ) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      "X-Agent-Id": this.agentId,
    }
  }

  async getJobs() {
    let res: Response
    try {
      res = await this.fetch(`${this.baseUrl}/api/agent/jobs`, {
        headers: this.headers(),
      })
    } catch (e) {
      throw new UnreachableError(e)
    }
    if (res.status === 401) throw new UnauthorizedError()
    if (!res.ok) throw new UnreachableError(`HTTP ${res.status}`)
    return JobsResponseSchema.parse(await res.json())
  }

  async pushHostPing(dto: HostPingDTO): Promise<IngestSuccessResponse> {
    return this._push("/api/agent/pings/host", dto)
  }

  async pushWebsitePing(dto: WebsitePingDTO): Promise<IngestSuccessResponse> {
    return this._push("/api/agent/pings/website", dto)
  }

  async pushContainerPing(
    dto: ContainerPingDTO,
  ): Promise<IngestSuccessResponse> {
    return this._push("/api/agent/pings/container", dto)
  }

  async pushGithubPing(
    dto: GithubPingDTO | GithubCheckRunDTO,
  ): Promise<IngestSuccessResponse> {
    return this._push("/api/agent/pings/github", dto)
  }

  private async _push(
    path: string,
    body: unknown,
  ): Promise<IngestSuccessResponse> {
    let res: Response
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new UnreachableError(e)
    }
    if (res.status === 401) throw new UnauthorizedError()
    // 409 is a successful deduplication response — let the body decide
    if (!res.ok && res.status !== 409) {
      throw new UnreachableError(`HTTP ${res.status}`)
    }
    return IngestSuccessResponseSchema.parse(await res.json())
  }
}
