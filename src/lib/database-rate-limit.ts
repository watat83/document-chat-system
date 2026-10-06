import { prisma } from '@/lib/prisma'

/** Increment a shared fixed-window counter in one atomic Postgres statement. */
export async function incrementDatabaseRateLimit(key: string, resetTime: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    WITH expired AS (
      DELETE FROM public.rate_limit_counters
      WHERE key IN (
        SELECT key FROM public.rate_limit_counters
        WHERE "resetAt" < now() - interval '1 day'
        ORDER BY "resetAt" LIMIT 100
      )
    )
    INSERT INTO public.rate_limit_counters (key, count, "resetAt")
    VALUES (${key}, 1, ${resetTime})
    ON CONFLICT (key) DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
  `
  const count = rows[0]?.count
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid rate-limit counter')
  return count
}
