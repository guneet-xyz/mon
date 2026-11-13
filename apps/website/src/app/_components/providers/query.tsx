"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Agents check every minute; refresh tiles and open dialogs at the same pace.
const client = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 60_000 } },
})
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
