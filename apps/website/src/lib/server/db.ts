import { env } from "@/env"

import { createDb, type Db } from "@mon/db"

const globalForDb = globalThis as unknown as { db: Db | undefined }

export const db: Db = globalForDb.db ?? createDb(env.DATABASE_URL)
if (env.NODE_ENV !== "production") globalForDb.db = db
