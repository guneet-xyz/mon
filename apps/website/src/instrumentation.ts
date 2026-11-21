export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    // Load the config now so an invalid file is reported in the log straight
    // away rather than on the first request.
    const { getConfigState } = await import("@/lib/server/config-cache")
    await getConfigState()
    const { startNotificationLoop } =
      await import("@/lib/server/notifications/loop")
    startNotificationLoop()
  }
}
