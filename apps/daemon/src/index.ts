import { getConfig } from "@mon/config"

async function main() {
  console.log("main")
  const config = await getConfig()
  console.log("config", config)
}

main().catch((err) => {
  console.error("Error in main:", err)
  process.exit(1)
})
