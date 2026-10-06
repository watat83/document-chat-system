const required = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) { console.error(`Missing production settings: ${missing.join(', ')}`); process.exitCode = 1; }
if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') || process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) { console.error('Use production Clerk keys before launch.'); process.exitCode = 1; }
if (process.env.DOCLING_ENABLED === 'true' && !process.env.DOCLING_API_TOKEN) { console.error('DOCLING_API_TOKEN is required for the private processing worker.'); process.exitCode = 1; }
