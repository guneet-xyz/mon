import { Card } from "@/components/ui/card"

import { Host } from "./_components/host"

import { getConfig } from "@mon/config"

export default async function HomePage() {
  const config = await getConfig()
  const empty = config.hosts.length === 0

  return (
    <div>
      <div className="font-display text-4xl font-bold">MON</div>

      {empty ? (
        <Card className="mx-auto w-[400px]">
          <div className="text-center">No monitors have been configured</div>
        </Card>
      ) : (
        <div>
          {config.hosts.map((host) => (
            <Host key={host.key} host={host} />
          ))}
        </div>
      )}
    </div>
  )
}
