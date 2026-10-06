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

## Second modernization checkpoint (2026-10-06)

AI SDK 7.0.128 and matching provider packages, Plate 53, and Stripe 23 are now pinned in the lockfile. SDK calls use the current token, usage, message conversion and stream response contracts; the application's public token fields remain compatible. Stripe requests target `2026-09-30.endive`, subscription periods come from subscription items, and Checkout no longer sends the removed `payment_method_types` field. No Stripe account configuration or webhook API version has been changed remotely.

The active OpenRouter adapter now implements buffered, cancellable streaming and ordered batch embeddings. Catalog prices are converted from dollars per token to dollars per thousand tokens; provider price limits use the API's object format. Failed or truncated streams do not record successful usage. Fallback cannot append a second answer after the first provider has emitted output. Analytics persist metrics without incrementing the billing ledger. Enhanced chat authenticates first, resolves the tenant from the database, rejects path-only file attachments, and returns a service error when providers fail. Development demo answers require `AI_ENABLE_DEMO=true` and remain disabled in production.

Document reads and mutations share one canonical serializer. New documents and uploads return that canonical shape. Section edits use persisted IDs and preserve extraction metadata; entity edits preserve IDs and metadata. Saving updates local state without sending a second mutation. Unsaved edits stay local and are reset when changing documents. Document responses omit share password/hash fields, avoid fabricated completion times and confidence, and only expose persisted security findings. Tenant resolution in the documents page uses the internal organization supplied by the profile API.

Notification streams support multiple tabs with independent cleanup and request-scoped heartbeats. Security alerts persist to `SecurityIncident`; anomaly events do not recursively scan themselves. Audit writes and queries use the current schema. The additive migration `20261006020000_generic_audit_events` introduces accurate generic CRUD and match feedback audit events; apply it together with the earlier pending migration through the normal migration deployment process. Neither migration has been applied by this audit.

Validation at this checkpoint:

- 15 Node regression tests pass, including canonical creation/response, document metadata edits, item billing periods and multi-tab notifications.
- 22 focused Jest tests pass across six suites, including authentication, tenant spoofing, path attachments, analytics billing, streaming/embedding contracts, partial stream fallback, cancellation and security monitoring.
- Prisma client generation succeeds. Dependency inspection reports two extraneous optional native packages and no invalid peer dependency entries.
- Strict checking of the production entry points and their full imported graph has fallen from 1,334 to 643 diagnostics. `tsconfig.build.json` checks that graph; `type-check:all` retains the original whole-project check for standalone examples, unused editor integrations and tests. Build errors remain enforced.
- The complete Jest run still fails: 11 failed suites, seven passed suites; 29 failed and 58 passed tests. Remaining failures include old provider contracts, ESM/test environment configuration and namespace expectations.
- npm audit reports 60 advisories (44 high, 12 moderate, four low; zero critical). Remaining transitive and spreadsheet advisories still need remediation.

This is a development checkpoint, not a production release. Continue resolving the processing/schema, SDK UI transport, test and lint failures before main promotion. The earlier staging and infrastructure validation requirements still apply. Notifications remain process-local best-effort delivery; persistent notification reads provide recovery across serverless instances. The development-only Prisma query extension was removed to give production and development one stable client type; Prisma's native logging remains available.

## Third modernization checkpoint (2026-10-06)

Durable processing now has run identities, persisted transitions, cancellation and supersession checks. Routes queue registered workers instead of marking fabricated analysis complete. Extraction, analysis and scoring preserve editor content, metadata and prior findings; partial embedding failures cannot produce a successful index. Embeddings go through the shared provider manager, validate vector count/dimensions/finite values before storage, retain complete chunk grounding and generate unique references. Vector queries remain constrained to the authorized tenant and current document references.

The production import graph now type-checks against Next 16, React 19, Plate 53, AI SDK 7, Pinecone 6, Prisma 6 and Stripe 23. Provider tests exercise current SDK/native request and usage contracts. Complete SDK streams reject errors, cancellation and missing finish events; fallback cannot append another provider after partial output. Markdown buffers flush before text-end and keep independent text part identities. Content generation verifies document access and tenant attribution. Editor command/copilot endpoints authenticate, enforce usage and record successful usage; client provider failures no longer synthesize demo answers. Deprecated static editor imports, query cache options, MIME metadata and UI processing status contracts are corrected.

Media endpoints reject forged internal-call/localhost/node-header authentication bypasses and derive tenant/user attribution from the database. ImageRouter uses its documented v3 catalog, separates media generation prices from text token rates, preserves zero-priced models, validates ranges, uses the catalog upper bound for estimates and records the provider's returned generation cost. Invented model catalogs, performance measurements and fixed generation prices are removed. Image requests currently support one generation; unsupported counts are rejected. Experimental direct-SDK A/B variants return an unavailable result until billing integration exists, while supported requests use the managed billing path and authenticated tenant attribution.

Global vector namespace and cache operations require the platform allowlist. Organization creation cannot move an existing account into a new tenant. Settings secrets require organization administrator access and an explicit ENCRYPTION_KEY of at least 32 characters; encryption/decryption errors cannot silently return plaintext success. Existing keys encrypted with the former fallback key need a controlled re-encryption or re-entry before rollout. Usage periods use exclusive boundaries and include the full final calendar day; stale subscription periods fail closed until synchronized. Missing quotas fail closed and developer overrides are removed. Usage check and later ledger write still require atomic quota reservations for strict concurrent enforcement.

Saved searches now use a real tenant-scoped model and additive migration `20261006030000_saved_search_contract`, with server-only RLS/grant restrictions and a partial unique index for active defaults. Security alert reads/acknowledgment use the existing incident ledger and migration `20261006040000_incident_acknowledgment`; database failures return unavailable, not empty success. File attachment requires private storage, resolves upload races, cleans failed staged objects, persists queue failures and returns queued status. Account hard deletion enforces the grace period and purges tenant storage and every historical Pinecone namespace before removing database data; external failures leave records available for retry. No deletion operation was run against a live account.

SAM.gov opportunity sync is explicitly unavailable because there is no registered worker or opportunity schema. Profile import remains supported, is administrator-scoped, checks UEI consistency and marks its data as user supplied rather than verified. Saved-search prefetch reports match scores unavailable instead of querying retired tables. Spreadsheet extraction replaces vulnerable npm `xlsx` with ExcelJS for XLSX and direct CSV text; legacy binary Office formats still require the isolated converter. Lowlight now matches the installed editor API; faker and its fake editor responses are removed.

Validation:

- Strict production type check passes. The full production build passes using an inert Clerk publishable-key fixture for local prerendering; an unconfigured build correctly fails for a missing real Clerk key.
- All 36 Jest suites pass: 293 tests. All 16 Node regressions pass. New cases cover malformed/oversized/partial embeddings, stream boundaries, private attachment races and queue failures, administrator gates, catalog price validation, period boundaries, encryption failures and account asset purge failures/historical namespaces.
- Prisma generation and offline migration diff generation pass. No migration has been applied remotely; staging migration and database integration checks remain required.
- Whole-project `type-check:all` still reports 1,451 diagnostics in standalone/legacy modules, examples and test contracts outside the production import graph. It remains available and was not disabled.
- Lint remains failing. The latest full recorded run reports 290 errors and 4,002 warnings, including React migration/compiler diagnostics and legacy imports; subsequent changes fixed the conditional-hook and debounced memo diagnostics but did not close the backlog. No rules were disabled to claim a pass.
- The current dependency audit reports 59 advisories: 41 high, 14 moderate, four low, zero critical. Remaining provider, Prisma, build/test and transitive dependency chains need reviewed remediation; no forced major upgrades or incompatible overrides were applied.
- Production configuration validation fails because database, encryption, Clerk, storage, vector and Redis credentials are absent from this workspace. Local unit tests use inert credentials and reject unmocked network calls.

The PR remains draft. Main promotion requires closing the lint/dependency gates, applying all four additive migrations in staging, then validating real private storage, authenticated document/editor flows, provider usage, Stripe webhooks, OCR, tenant vector deletion and Inngest processing. No production deployment or external billing configuration was changed.
