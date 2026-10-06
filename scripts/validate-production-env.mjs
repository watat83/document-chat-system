const required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) { console.error(`Missing production settings: ${missing.join(', ')}`); process.exitCode = 1; }
if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') || process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) { console.error('Use production Clerk keys before launch.'); process.exitCode = 1; }
if (process.env.DOCLING_ENABLED === 'true' && !process.env.DOCLING_API_TOKEN) { console.error('DOCLING_API_TOKEN is required for the private processing worker.'); process.exitCode = 1; }

if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) { console.error('ENCRYPTION_KEY must contain at least 32 characters.'); process.exitCode = 1; }

if (Boolean(process.env.UPSTASH_REDIS_REST_URL) !== Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)) {
  console.error('Configure both Upstash settings, or omit both to use PostgreSQL rate limiting.'); process.exitCode = 1;
}
