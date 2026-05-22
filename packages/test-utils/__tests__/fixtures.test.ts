import { getConfig } from "@mon/config"
import { fixturePath } from "../fixtures/index"
import { describe, it, expect } from "bun:test"

describe("fixtures", () => {
  it("minimal.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("minimal.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(0)
  })

  it("single-host.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("single-host.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(1)
    expect(config.tiles[0].type).toBe("host")
  })

  it("single-website.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("single-website.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(1)
    expect(config.tiles[0].type).toBe("website")
  })

  it("single-container.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("single-container.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(1)
    expect(config.tiles[0].type).toBe("container")
  })

  it("single-github.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("single-github.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(1)
    expect(config.tiles[0].type).toBe("github")
  })

  it("multi-agent.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("multi-agent.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(4)
    expect(config.agents).toBeDefined()
    expect(Object.keys(config.agents)).toHaveLength(2)
  })

  it("unreachable.toml loads successfully", async () => {
    const config = await getConfig(fixturePath("unreachable.toml"))
    expect(config).toBeDefined()
    expect(config.tiles).toHaveLength(2)
    const types = config.tiles.map((t) => t.type)
    expect(types).toContain("host")
    expect(types).toContain("website")
  })
})
