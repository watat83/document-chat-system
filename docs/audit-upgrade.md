# Audit implementation and rollout

This branch implements the security and correctness foundation of the audit. It is a draft and is **not ready for production promotion**. The larger architecture/UI roadmap and the repository's existing type/schema inconsistencies are not complete.

## Implemented

- Next.js 16.3.8, React 19.3.0, Clerk 6.39.7 and Prisma 6.19.3; committed dependency lockfile. Next request APIs migrated; `proxy.ts` replaces middleware; ESLint runs through its CLI. Webpack remains explicit for existing integrations.
- Builds no longer ignore TypeScript errors. CI runs regression checks, full type/lint checks, and existing tests separately.
- Platform administration requires an exact server-configured Clerk ID allowlist. Organization OWNER/ADMIN roles do not administer global pricing. Unsafe process-local AI configuration writes now return 405 for platform administrators and 403 for other users; update environment configuration and redeploy instead.
- Exact tenant authorization; personal user provisioning creates the user and organization atomically, uses the full Clerk identifier, and handles concurrent initialization. No temporary email/default-tenant creation in uploads.
- Document mutations enforce ownership, organization role, or an unexpired permission grant. Processing/version/content/entity endpoints use the same guard. Sharing and permission APIs use the existing JSON schema rather than nonexistent Prisma models.
- Provider webhooks are public through proxy routing but verify signatures. Clerk uses asynchronous headers. Stripe events have atomic processing leases, completed-only deduplication, retryable failures, and current subscription retrieval for create/update/invoice deliveries, including Basil invoice parent references.
- Upload validation handles missing files, absent document type, invalid tag data and folder fallback. Metadata failure attempts object cleanup. Production rejects local public upload fallback and public document buckets.
- Authenticated storage downloads replace public/decade-long links. Document downloads ignore deleted documents and use private/no-store caching. Existing storage URLs still require migration and private bucket configuration.
- SSE parsing buffers complete events and handles arbitrary byte/UTF-8 splits, CRLF, multiline data and truncated responses. Document chat advertises event-stream MIME. Stream errors surface to users.
- Document edit/preview/saved search hooks run consistently across loading/authentication renders.
- Search uses the same active organization document set for all modes, includes documents beyond the first 20, treats an empty selection as empty, and surfaces retrieval failure. Unsupported document-chat model families return an error instead of silently using a different model.
- Pinecone clients are initialized at invocation rather than module import. Deletions use the actual organization namespace and metadata filters without a 10,000-vector cutoff. Document deletion creates a tombstone before cleanup; failed cleanup is retryable. Cached results are revalidated against active documents/current embedding content.
- Cache keys include scoring/hybrid options; search enrichment batches document reads. Partial embedding failures fail the processing job; finalization reads current progress history. pgvector fallback requires explicit completed-backfill confirmation.
- Rate-limit identity comes from verified Clerk authentication rather than caller headers. Production Redis failures reject work. AI/chat/upload paths check server-side usage before expensive work; the hardcoded developer bypass is removed. This is a preflight check, not an atomic spending reservation.
- Durable private conversation storage, user/organization ownership checks and revision conflicts; chat restores the last conversation and autosaves final messages. Saves serialize concurrent updates. Attachment blobs are intentionally not persisted. Stop aborts text chat fetches; provider cancellation depends on transport support.
- Expiring share links, salted password hashes, protected settings, a public preview/download route, optimistic update checks and revocation on document deletion. Links without expiry/legacy plaintext passwords must be recreated. View analytics are not implemented.
- Docling authenticates private worker requests, bounds main upload size, runs conversion in a worker thread under a memory/concurrency lock, applies OCR/table/image pipeline options, explicitly rejects unsupported layout settings, and disables remote-URL processing. Proxy forwards selected content headers plus a service token, awaits params and avoids long inline retry chains.

## Validation

- 9 Node regression tests pass, including every byte split of a Unicode SSE response, access policy, password hashing, cache keys, and concurrent/retried webhook claims.
- 5 Jest route tests pass for document mutation access, deleted/foreign documents, private conversation access and revision conflicts.
- New security/conversation/share files pass ESLint with zero errors. Python service compiles. Changed TS/JS files parse and `git diff --check` passes.
- Compatible npm audit fixes reduced the audit from 139 findings (3 critical) to 59 findings (0 critical, 44 high, 9 moderate, 6 low). Counts include direct/transitive and development dependencies; this is not proof that runtime exploitation is possible or absent.
- The full type check still reports approximately 2,900 diagnostics (2,919 in the last complete standalone run). These are cascading diagnostics, not that many independent defects. The original audit found 2,952. Missing models/enums/modules and legacy government-contracting paths remain.
- Existing Jest infrastructure now executes tests, but the existing suite remains failing; final existing-suite run: 41 passing tests, 8 failing tests and 11 failing suites (the five new route tests pass).
- Full production build reaches TypeScript but fails verification (including a default 2 GB heap exhaustion during type checking). It cannot be promoted with the restored gate. No authenticated live-browser, database migration, Stripe delivery, Pinecone deletion or real OCR integration test has been run against a staging environment.

## Required rollout configuration

1. Resolve full-project type/schema/test/lint failures; run the real production build. Do not restore ignored build errors to deploy this branch.
2. Review and apply `prisma/migrations/20261006010000_billing_event_processing_lease/migration.sql` on staging, then regenerate Prisma. It adds the webhook lease and conversations table with foreign keys, RLS and revoked anonymous/authenticated Data API access. Existing databases need their migration history baselined before `prisma migrate deploy`; no migration was applied by this implementation.
3. Set `PLATFORM_ADMIN_CLERK_IDS` to the exact intended platform administrators. An empty allowlist denies global administration. This is independent of tenant roles.
4. Configure production Clerk keys/domains. The live deployment previously used development keys; this branch does not change provider dashboard configuration.
5. Make the `documents` bucket private and migrate existing persisted public/signed URLs to authenticated endpoints. Audit existing bucket policies and organization image URLs before rollout. Uploads fail closed while the bucket remains public.
6. Configure Upstash Redis for distributed production enforcement. Set the same `DOCLING_API_TOKEN` on the Next server and processing worker. Local unauthenticated worker use requires explicitly setting `DOCLING_ALLOW_UNAUTHENTICATED_LOCAL=true` on a development worker. Enable OCR deliberately with sufficient worker resources.
7. Keep pgvector fallback off unless an actual index has been populated/backfilled and verified. Only then set `PGVECTOR_BACKFILL_COMPLETE=true`; the normal primary index remains Pinecone.
8. Verify two-organization permissions, share expiry/password/revocation, webhook duplicate/retry/crash recovery, 21+ document and empty scopes, partial processing/retry, deletion/revocation, reload persistence and cancellation on staging. Verify existing legal/business workflows before migrating or retiring legacy paths.

## Remaining modernization work

- Reconcile the authoritative Prisma schema, domain types and legacy application code. Many active routes refer to missing models/fields; permissions guards do not make their implementations functional.
- Migrate the AI SDK/provider packages through supported major-version guides with editor/Plate compatibility, normalize transports and citation/source rendering, plan the Stripe SDK/API migration together with subscription-item billing periods, and replace dependency chains with remaining high-severity advisories (including the maintained spreadsheet solution). No forced major dependency sweep was used.
- Introduce atomic usage/cost reservations and settlement, a durable cleanup/outbox queue, index revisions, a verified pgvector replica if retained, bounded background extraction jobs and redacted distributed tracing.
- Finish the proposed documents/chat/source workspace, mobile navigation, history list/new conversation management, retries, accurate model/cost display, upload state design and evidence-based citations. Current latest-conversation persistence is the first part of that work.
- Review marketing claims and remove stale promises that do not match verified capabilities.

No production deployment, database/provider mutation or merge has been performed.
