"use client"

import { useQuery } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"

import { getConfigError } from "@/lib/server/actions/get-config-error"

// Shown over the board while the config file on disk is invalid and the last
// good config is being served. It refreshes with the tiles, so a board left
// open picks up a broken or fixed file. The summary names a location, never
// contents.
export function ConfigErrorBanner({
  initialSummary,
}: {
  initialSummary: string | null
}) {
  const { data: summary } = useQuery({
    queryKey: ["config-error"],
    queryFn: async () => await getConfigError(),
    initialData: initialSummary,
  })
  if (!summary) return null

  return (
    <div
      role="status"
      data-testid="config-error-banner"
      className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3"
    >
      <div className="flex max-w-xl items-start gap-2 rounded-lg border border-amber-400 bg-amber-50/95 px-3 py-2 text-sm text-amber-950 shadow-md dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <p>
          <span className="font-semibold">
            Config error: showing the last good config.
          </span>{" "}
          <span className="text-amber-800 dark:text-amber-300">
            {summary}. See the website log for details.
          </span>
        </p>
      </div>
    </div>
  )
}
