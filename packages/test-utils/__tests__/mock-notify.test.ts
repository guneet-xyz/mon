import { afterEach, describe, expect, it } from "bun:test"

import { createMockNotifyServer, type MockNotifyServer } from "../index"

describe("createMockNotifyServer", () => {
  let server: MockNotifyServer | undefined

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  const post = (url: string, body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer t",
      },
      body: JSON.stringify(body),
    })

  it("ok: records the path, headers and JSON body", async () => {
    server = await createMockNotifyServer()
    const res = await post(`${server.url}/hook`, { hello: "world" })
    expect(res.status).toBe(200)
    expect(server.delivered).toHaveLength(1)
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/hook",
      json: { hello: "world" },
    })
    expect(server.requests[0]?.headers.authorization).toBe("Bearer t")
  })

  it("http_error: answers every request with the status", async () => {
    server = await createMockNotifyServer()
    server.setScenario({ kind: "http_error", status: 503 })
    expect((await post(server.url, {})).status).toBe(503)
    expect(server.requests).toHaveLength(1)
    expect(server.delivered).toHaveLength(0)
  })

  it("flaky: fails the first requests, then succeeds", async () => {
    server = await createMockNotifyServer()
    server.setScenario({ kind: "flaky", times: 2, status: 500 })
    const statuses = []
    for (let i = 0; i < 3; i++)
      statuses.push((await post(server.url, {})).status)
    expect(statuses).toEqual([500, 500, 200])
    expect(server.delivered).toHaveLength(1)
  })
})
