import { toPublicConfig } from "@mon/config"

import { ClientOnly } from "@/components/client-only"
import { env } from "@/env"
import { getConfigState } from "@/lib/server/config-cache"

import { ConfigErrorBanner } from "./_components/config-error-banner"
import { ConfigUnavailable, EmptyBoard } from "./_components/config-status"
import { TileGrid } from "./tile-grid"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const { config, error } = await getConfigState()
  if (!config) return <ConfigUnavailable summary={error.summary} />

  return (
    <>
      {config.tiles.length === 0 ? (
        <EmptyBoard configPath={env.CONFIG_PATH} />
      ) : (
        <ClientOnly>
          <TileGrid config={toPublicConfig(config)} />
        </ClientOnly>
      )}
      <ClientOnly>
        <ConfigErrorBanner initialSummary={error?.summary ?? null} />
      </ClientOnly>
    </>
  )
}
