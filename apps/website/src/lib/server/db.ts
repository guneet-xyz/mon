import { type Db, createDb } from "@mon/db"

import { env } from "@/env"

const globalForDb = globalThis as unknown as { db: Db | undefined }

function getDb(): Db {
  globalForDb.db ??= createDb(env.DATABASE_URL)
  return globalForDb.db
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop) as unknown
  },
})
