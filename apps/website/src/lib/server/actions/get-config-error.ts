"use server"

import { getConfigState } from "@/lib/server/config-cache"

// The public-safe summary of the current config file's problem, or null when
// it is valid. Lets an open board show or clear the banner without a reload.
export async function getConfigError(): Promise<string | null> {
  const { error } = await getConfigState()
  return error?.summary ?? null
}
