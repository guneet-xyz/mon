// Loads the config once at startup so an invalid file is reported in the log
// straight away rather than on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfigState } = await import("@/lib/server/config-cache")
    await getConfigState()
  }
}
