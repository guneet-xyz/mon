import { Card, CardContent } from "@/components/ui/card"

import { HostCard } from "./_components/host/card"
import { WebsiteCard } from "./_components/website/card"

import { getConfig } from "@mon/config"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const config = await getConfig()

  return (
    <div className="">
      <div className="space-y-4">
        <div className="font-display text-2xl font-semibold">Hosts</div>
        {config.hosts.length === 0 ? (
          <Card className="mx-auto w-[400px]">
            <CardContent>No monitors have been configured</CardContent>
          </Card>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {config.hosts.map((host) => (
              <HostCard key={host.key} host={host} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-4">
        <div className="font-display text-2xl font-semibold">Websites</div>
        {config.websites.length === 0 ? (
          <Card className="mx-auto w-[400px]">
            <CardContent>No websites have been configured</CardContent>
          </Card>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            {config.websites.map((website) => (
              <WebsiteCard key={website.key} website={website} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
