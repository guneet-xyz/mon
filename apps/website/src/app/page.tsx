import { getConfig } from "@mon/config"

import { ClientOnly } from "@/components/client-only"

import { TileGrid } from "./tile-grid"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const config = await getConfig()

  return (
    <ClientOnly>
      <TileGrid config={config} />
    </ClientOnly>
  )
}
