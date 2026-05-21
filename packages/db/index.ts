import * as schema from "./schema"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

export type Db = ReturnType<typeof drizzle<typeof schema>>

export function createDb(url: string): Db {
  const conn = postgres(url)
  return drizzle(conn, { schema })
}
