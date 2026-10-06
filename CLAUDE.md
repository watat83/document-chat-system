# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Document Chat System is a production-ready Next.js 15 application that combines intelligent document management with AI-powered conversations. It's a multi-tenant SaaS platform supporting multiple AI providers (OpenRouter, OpenAI, Anthropic), background job processing with Inngest, and vector search via Pinecone/pgvector.

## Development Commands

### Essential Commands
```bash
# Development
npm run dev                 # Start dev server (localhost:3000)
npm run build              # Production build (runs prisma generate first)
npm run start              # Start production server
npm run lint               # Run ESLint
npm run type-check         # TypeScript type checking

# Database (Prisma)
npm run db:generate        # Generate Prisma client
npm run db:push            # Push schema changes to database
npm run db:migrate         # Create and run migration
npm run db:studio          # Open Prisma Studio GUI
npm run db:seed            # Seed database with initial data
npm run db:reset           # ⚠️ Reset database (deletes all data)

# Combined Development
npm run dev:setup          # npm install + prisma generate + db push
npm run dev:reset          # db reset + db seed + dev server
```

### Running Tests
```bash
npm test                   # Run Jest tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

### Background Jobs (Inngest)
```bash
npx inngest-cli dev        # Start Inngest dev server at localhost:8288
```

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS, shadcn/ui, Zustand
- **Backend**: Next.js API Routes, Prisma ORM, PostgreSQL 14+
- **AI**: OpenRouter (100+ models), OpenAI, Anthropic via Vercel AI SDK
- **Auth**: Clerk (multi-tenant with organizations)
- **Storage**: Supabase (files) + PostgreSQL (metadata)
- **Background Jobs**: Inngest (document processing pipeline)
- **Vector Search**: Pinecone or pgvector
- **Cache**: Upstash Redis (optional)
- **Billing**: Stripe (optional)

### Directory Structure Deep Dive

```
src/
├── app/                          # Next.js 15 App Router
│   ├── api/                      # API routes
│   │   ├── inngest/             # Inngest webhook endpoint
│   │   └── v1/                  # Versioned REST APIs
│   ├── [page-routes]/           # Page routes (dashboard, chat, documents, etc.)
│   ├── layout.tsx               # Root layout with providers
│   └── middleware.ts            # Auth, CORS, rate limiting
│
├── lib/                         # Core business logic
│   ├── ai/                      # AI service layer (CRITICAL)
│   │   ├── providers/          # AI provider adapters
│   │   │   ├── openai-adapter.ts
│   │   │   ├── anthropic-adapter.ts
│   │   │   ├── smart-openrouter-adapter.ts  # Main OpenRouter implementation
│   │   │   └── factory.ts      # Provider factory pattern
│   │   ├── services/           # AI processing services
│   │   │   ├── embedding-service.ts         # Generate embeddings
│   │   │   ├── vector-search.ts            # Semantic search
│   │   │   ├── document-chunker.ts         # Split documents into chunks
│   │   │   ├── hybrid-search.ts            # Combine vector + keyword search
│   │   │   └── document-*-analyzer.ts      # Document analysis services
│   │   ├── routing/            # Intelligent request routing
│   │   ├── monitoring/         # Metrics, cost tracking, alerts
│   │   ├── config/             # AI configuration, feature flags, model registry
│   │   ├── prompts/            # Prompt templates and library
│   │   └── ai-service-manager.ts           # Main AI orchestration layer
│   │
│   ├── inngest/                # Background job processing
│   │   ├── client.ts           # Inngest client configuration
│   │   └── functions/          # Job definitions
│   │       ├── process-document-basic.ts   # Text extraction + sections
│   │       ├── process-document-full.ts    # Complete analysis
│   │       ├── vectorize-document.ts       # Generate embeddings
│   │       ├── analyze-document.ts         # AI-powered analysis
│   │       └── batch-process-documents.ts  # Batch processing
│   │
│   ├── documents/              # Document management logic
│   ├── file-processing/        # File type handlers (PDF, DOCX, images, etc.)
│   ├── auth/                   # Clerk authentication utilities
│   ├── storage/                # Supabase file storage
│   ├── db/                     # Prisma utilities and helpers
│   ├── cache/                  # Redis caching layer
│   ├── errors/                 # Custom error classes and handling
│   ├── audit/                  # Audit logging system
│   └── validation/             # Zod schemas for input validation
│
├── components/                  # React components
│   ├── ui/                     # shadcn/ui primitives
│   ├── documents/              # Document management UI
│   ├── chat/                   # AI chat interface
│   ├── billing/                # Stripe billing UI
│   └── layout/                 # App layout components
│
├── stores/                     # Zustand state management
├── hooks/                      # Custom React hooks
├── contexts/                   # React Context providers
└── types/                      # TypeScript type definitions
```

### Data Flow Patterns

#### Document Upload & Processing Flow
```
1. User uploads file → API Route (/api/v1/documents/upload)
2. File stored in Supabase Storage
3. Document record created in PostgreSQL (status: PENDING)
4. Inngest event triggered: "document/process-basic.requested"
5. Background job processes document:
   a. Extract text (process-document-basic)
   b. Chunk content (document-chunker)
   c. Generate embeddings (vectorize-document)
   d. Store vectors in Pinecone/pgvector
   e. Analyze content (analyze-document)
6. Update document status to COMPLETED
7. UI polls for updates or receives real-time notification
```

#### AI Chat Flow
```
1. User sends message → /api/v1/ai/chat
2. Retrieve relevant document chunks via vector search
3. Build context from chunks + chat history
4. Route request through ai-service-manager
5. ai-service-manager selects provider (OpenRouter/OpenAI/Anthropic)
6. Stream response tokens back to client
7. Save message to database with citations
8. Track metrics (cost, latency, tokens)
```

### Key Architectural Patterns

#### Multi-Tenant Isolation
- Every database query MUST filter by `organizationId`
- Clerk provides organization context via `auth()`
- Row-level security enforced at API layer
- Separate Pinecone namespaces per organization

#### AI Provider Abstraction
The system uses a provider adapter pattern in `src/lib/ai/providers/`:
- `factory.ts` - Creates appropriate provider based on config
- `smart-openrouter-adapter.ts` - Main OpenRouter implementation with smart routing
- `openai-adapter.ts` - Direct OpenAI integration
- `anthropic-adapter.ts` - Direct Anthropic integration

All providers implement the same interface from `src/lib/ai/interfaces/base-adapter.ts`.

#### Background Job Processing (Inngest)
Critical: Document processing happens asynchronously!
- Events defined in `src/lib/inngest/functions/`
- Jobs are retryable with exponential backoff
- Concurrency limits prevent resource exhaustion
- Status tracked in `document.processing` JSONB field

#### Caching Strategy
Three-tier caching:
1. **Redis** (Upstash) - Distributed cache for API responses
2. **Memory Cache** - In-process cache for frequently accessed data
3. **Browser Cache** - Client-side caching via React Query

#### Error Handling
Centralized error system in `src/lib/errors/`:
- Custom error classes with proper inheritance
- Circuit breaker pattern for external services
- Automatic retry logic with exponential backoff
- Structured error logging for debugging

## Critical Implementation Details

### Environment Variables
**Required for development:**
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` - Auth
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Storage
- `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` - Background jobs
- At least one AI provider key (OPENROUTER_API_KEY recommended)

**Important configuration:**
- `OPENROUTER_SMART_ROUTING=true` - Enable intelligent model routing
- `OPENROUTER_COST_OPTIMIZATION="balanced"` - Cost vs quality tradeoff
- `AI_ENABLE_FALLBACK=true` - Automatic provider fallback
- `AI_ENABLE_CIRCUIT_BREAKER=true` - Circuit breaker protection

### Database Schema (Prisma)
Located in `prisma/schema.prisma`:
- **Organization** - Multi-tenant root entity
- **User** - Maps to Clerk users via `clerkId`
- **Document** - Uploaded files with processing metadata
- **Folder** - Hierarchical organization
- **Subscription** - Stripe billing integration
- **AIMetric** - AI usage tracking
- **AuditLog** - Complete audit trail

After schema changes:
```bash
npm run db:push              # Push to dev database
npm run db:migrate           # Create migration for production
```

### Inngest Function Naming
When creating new Inngest functions, follow this pattern:
```typescript
export const myFunction = inngest.createFunction(
  {
    id: "my-function",           // Must match function name in dashboard
    name: "My Function",         // Human-readable display name
    retries: 3,                  // Number of automatic retries
    concurrency: { limit: 5 },  // Max concurrent executions
  },
  { event: "my-domain/my-event.requested" },  // Event trigger
  async ({ event, step }) => {
    // Use step.run() for retry boundaries
    const result = await step.run("step-name", async () => {
      // Your logic here
    });
  }
);
```

### AI Provider Configuration
The AI layer in `src/lib/ai/` is highly configurable:
- **Model Registry** (`config/model-registry.ts`) - Centralized model definitions
- **Feature Flags** (`config/feature-flags.ts`) - Enable/disable features
- **Routing** (`routing/request-router.ts`) - Route requests to appropriate provider
- **Monitoring** (`monitoring/`) - Track costs, latency, errors

When adding new models, update the model registry first.

### Vector Search Implementation
Two implementations available:
1. **Pinecone** (`src/lib/ai/services/vector-search.ts`)
   - Production-ready, managed service
   - Separate namespaces per organization
   - Index name configured via `PINECONE_INDEX_NAME`

2. **pgvector** (`src/lib/ai/services/pgvector-search.ts`)
   - Uses PostgreSQL extension
   - Good for development or single-tenant
   - Enable with `ENABLE_PGVECTOR_FALLBACK=true`

### Testing Strategy
When writing tests:
- Unit tests in `src/lib/**/__tests__/`
- Use the shared test utilities in `src/lib/ai/__tests__/shared/`
- Mock external services (OpenRouter, Pinecone, etc.)
- Test error handling and edge cases
- Validate AI provider contracts with `contract-tests.ts`

## Common Development Tasks

### Adding a New AI Provider
1. Create adapter in `src/lib/ai/providers/my-provider-adapter.ts`
2. Implement `BaseAIServiceAdapter` interface
3. Add provider to factory in `providers/factory.ts`
4. Update model registry with new models
5. Add provider key to `.env.example`
6. Write contract tests

### Adding a New Inngest Function
1. Create function file in `src/lib/inngest/functions/`
2. Define event schema and handler
3. Export from `src/lib/inngest/index.ts`
4. Add event trigger in appropriate API route
5. Test locally with `npx inngest-cli dev`
6. Verify function appears in Inngest dashboard after deploy

### Adding a New API Endpoint
1. Create route in `src/app/api/v1/[endpoint]/route.ts`
2. Validate input with Zod schema from `src/lib/validation/`
3. Check authentication with `auth()` from Clerk
4. Filter by `organizationId` for multi-tenant isolation
5. Add error handling with custom error classes
6. Document endpoint in API docs

### Modifying Database Schema
1. Edit `prisma/schema.prisma`
2. Run `npm run db:push` for development
3. Run `npm run db:migrate` to create migration
4. Update TypeScript types if needed
5. Update seed script if adding required fields
6. Test with fresh database: `npm run dev:reset`

## Production Deployment Notes

### Inngest Configuration (CRITICAL)
After deploying to production:
1. Go to Inngest Dashboard → Apps → Sync
2. Enter your production URL: `https://your-domain.com/api/inngest`
3. Verify all 7 functions appear (process-document-basic, vectorize-document, etc.)
4. Test by uploading a document and checking Inngest Dashboard → Runs

Without this step, document processing will fail silently!

### Environment Variables in Production
Use the automated Vercel deployment script:
```bash
./scripts/setup-vercel.sh --all    # Sync all env vars to Vercel
vercel --prod                      # Deploy to production
```

### Database Migrations
Always use migrations in production (not `db:push`):
```bash
npm run db:migrate          # Create migration
vercel --prod              # Deploy with new schema
```

### Monitoring Production
Key dashboards to monitor:
- **Inngest Dashboard** (app.inngest.com) - Background job status
- **Clerk Dashboard** - Authentication metrics
- **Supabase Dashboard** - Database and storage usage
- **Vercel Analytics** - Performance and errors
- **Stripe Dashboard** - Billing (if enabled)

## Troubleshooting

### Documents Not Processing
1. Check Inngest Dashboard for failed jobs
2. Verify `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set
3. Confirm functions are synced in Inngest Dashboard
4. Check application logs for errors
5. Verify Supabase storage permissions

### AI Responses Failing
1. Check provider API keys are valid
2. Verify provider has available credits
3. Check circuit breaker status in logs
4. Try fallback provider if enabled
5. Review AI metrics in database

### Vector Search Not Working
1. Verify Pinecone index exists with correct dimensions (1536 for OpenAI)
2. Check namespace format: `org_{organizationId}`
3. Confirm embeddings were generated (check `document.processing.embeddingGenerated`)
4. Try pgvector fallback if enabled
5. Check vector search timeout settings

### Build Failures
```bash
# Clean build
rm -rf .next node_modules package-lock.json
npm install
npx prisma generate
npm run build
```

### Type Errors
```bash
npm run type-check          # Identify type errors
npx prisma generate         # Regenerate Prisma types
```

## Code Style Guidelines

- Use TypeScript strict mode (already configured)
- Follow ESLint rules: `npm run lint`
- Use `@/` imports for absolute paths (configured in tsconfig.json)
- Prefer async/await over promises
- Use Zod for runtime validation
- Add JSDoc comments for complex functions
- Keep API routes thin, logic in `src/lib/`

## Git Commit Guidelines

**CRITICAL: This is a PUBLIC open-source repository - ALWAYS ask before committing/pushing**

### Before Committing or Pushing:

1. **ALWAYS ask the user for permission before**:
   - Creating any git commits
   - Pushing any commits to GitHub
   - Making any changes to the git repository

2. **When asking for permission**:
   - Clearly list what files will be committed
   - Explain what changes were made
   - Wait for explicit user approval
   - Example: "I've made the following changes: [list changes]. Should I commit and push these to GitHub?"

3. **Exception**: Only commit/push without asking if the user explicitly instructs you to do so
   - Example user request: "commit these changes and push to github"
   - Example user request: "push this to the repo"

### Commit Message Guidelines:

**IMPORTANT: Do NOT add Claude Code or Anthropic attribution to git commits**

When creating git commits:

1. **Never include**:
   - "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
   - "Co-Authored-By: Claude <noreply@anthropic.com>"
   - Any other Claude Code or Anthropic attribution

2. **Commit messages should**:
   - Read applicable `CLAUDE.md`, `gemini.md`/`GEMINI.md`, and `codex.md`/`CODEX.md` guidance before drafting each commit
   - Be clear and descriptive
   - Follow conventional commit format when appropriate
   - Focus on what changed and why
   - Use a concise subject and a detailed, professional body that helps the next developer understand the change
   - Explain the problem, resulting behavior, significant implementation choices, and validation results
   - Record known limitations, migration/configuration requirements, and follow-up work when relevant; distinguish passing checks from unresolved failures

3. **Example of correct commit message**:
   ```
   Update Document Chat System branding and features

   - Remove unused sections from landing page
   - Add Vercel deployment automation
   - Fix mobile responsiveness issues
   - Update copyright year to 2025
   ```

This project is an open-source repository and commits should reflect the human developer's work without AI tool attribution in the commit history.

## Important Constraints

### Security
- NEVER commit API keys or secrets
- ALWAYS validate input with Zod schemas
- ALWAYS filter by organizationId in multi-tenant queries
- Use Clerk's `auth()` for authentication, not custom JWT
- Sanitize user input before rendering (use DOMPurify)

### Performance
- Use Redis caching for expensive operations
- Implement pagination for large result sets (use `DEFAULT_PAGE_SIZE=25`)
- Optimize database queries with proper indexes
- Use streaming for AI responses
- Lazy load heavy components

### AI Usage
- Track costs in `AIMetric` table
- Respect usage limits from pricing plans
- Use circuit breakers for external API calls
- Implement rate limiting per organization
- Cache embeddings to avoid regeneration

## Project-Specific Patterns

### BYOK (Bring Your Own Key) Architecture
Users can provide their own AI API keys via Settings page:
- Keys encrypted with AES-256 before localStorage
- Keys sent to backend on each AI request
- Backend validates and uses user's key instead of system key
- Provides cost transparency and privacy

### Multi-Tenant Data Access Pattern
Every database query must include organizationId:
```typescript
const documents = await prisma.document.findMany({
  where: {
    organizationId: auth().orgId,  // Always filter by org
    userId: auth().userId,         // Additional user filter if needed
  },
});
```

### Document Processing State Machine
Documents progress through states:
- PENDING → PROCESSING → COMPLETED
- PENDING → PROCESSING → FAILED
- Track in `document.status` and `document.processing` JSONB

### Error Recovery Strategy
1. Circuit Breaker - Prevent cascading failures
2. Automatic Retry - Exponential backoff with jitter
3. Fallback Provider - Switch to backup AI provider
4. Graceful Degradation - Return cached or partial results

## Resources

- **Main README**: Comprehensive setup and deployment guide
- **Prisma Schema**: `prisma/schema.prisma` - Complete database structure
- **AI Architecture**: `src/lib/ai/README.md` - AI routing and providers
- **Error Handling**: `src/lib/errors/README.md` - Error system documentation
- **File Processing**: `src/lib/file-processing/README.md` - File type handlers
