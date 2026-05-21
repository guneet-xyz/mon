import { getConfig } from "@mon/config"

import { ClientOnly } from "@/components/client-only"
import { env } from "@/env"

import { TileGrid } from "./tile-grid"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const config = await getConfig(env.CONFIG_PATH)

  return (
    <ClientOnly>
      <TileGrid config={config} />
    </ClientOnly>
  )
}
