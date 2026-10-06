// Unit tests use inert local fixtures; never inherit service credentials from the shell.
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/document_chat_test',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhhbXBsZS50ZXN0JA',
  CLERK_SECRET_KEY: 'sk_test_unit_fixture',
  NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'unit-test-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service',
  OPENROUTER_API_KEY: 'sk-test-openrouter',
  OPENAI_API_KEY: 'sk-test-openai',
  ANTHROPIC_API_KEY: 'sk-test-anthropic',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-google',
  INNGEST_EVENT_KEY: 'test-inngest',
  INNGEST_SIGNING_KEY: 'test-signing',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  PINECONE_API_KEY: '',
  REDIS_HOST: '',
  DOCLING_ENABLED: 'false',
  PLATFORM_ADMIN_CLERK_IDS: '',
});
// Every unit-test network dependency must be mocked explicitly.
global.fetch = async () => { throw new Error('Unmocked network request in unit tests'); };
