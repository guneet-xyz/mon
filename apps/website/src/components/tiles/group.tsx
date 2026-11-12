"use client"

import { GroupDialog } from "@/components/dialogs/group-dialog"
import { getGroupTileInfo } from "@/lib/server/actions/get-group-tile-info"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

import { useQuery } from "@tanstack/react-query"

export function GroupTile({
  dbKey,
  r_span,
  c_span,
}: {
  dbKey: string
  r_span: number
  c_span: number
}) {
  const { data, isFetched } = useQuery({
    queryKey: ["group-config", dbKey],
    queryFn: async () => await getGroupTileInfo(dbKey),
  })
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status, members } = data

  let title: string
  const name = config.name ?? config.key

  if (config.short_name) {
    title = config.short_name
  } else if (r_span === 1 && c_span === 1) {
    title = name.length > 3 ? name[0]!.toUpperCase() : name
  } else {
    title = name
  }

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }

  const statuses = members.map((member) => member.status)
  const up = statuses.filter((memberStatus) => memberStatus === "online").length

  return (
    <GroupDialog dbKey={dbKey}>
      <BaseTile
        r_span={r_span}
        c_span={c_span}
        title={title}
        top_text={`${up}/${members.length} up`}
        status={status}
        orientation={orientation}
        icon={config.icon}
        top_right_icon="mdi:view-grid-outline"
        statusLine={statuses}
      />
    </GroupDialog>
  )
}
