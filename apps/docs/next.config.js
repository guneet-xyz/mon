import nextra from "nextra"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const withNextra = nextra({
  contentDirBasePath: "/docs",
})

export default withNextra({
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
})
