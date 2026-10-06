import { getInvoiceSubscriptionId } from '../../src/lib/billing/invoice-subscription';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessOrganization, canAccessDocument, isPlatformAdminId } from '../../src/lib/security/access-policy';
import { readSSEData } from '../../src/lib/ai/sse-reader';
import { hashSharePassword, verifySharePassword, isShareActive } from '../../src/lib/security/share-password';
import { VectorSearchCache } from '../../src/lib/ai/services/vector-search-cache';
import { claimWebhook } from '../../src/lib/billing/webhook-lease';
const member = { id: 'member', organizationId: 'org-a', role: 'MEMBER' };
const doc = { uploadedById: 'uploader', organizationId: 'org-a', sharing: {} };
test('an assigned organization never grants access to the shared default tenant', () => {
  assert.equal(canAccessOrganization(member, 'default'), false);
  assert.equal(canAccessOrganization(member, 'org-a'), true);
  assert.equal(canAccessOrganization(null, 'org-a'), false);
});
test('platform admins require an exact configured Clerk id independently of organization roles', () => {
  assert.equal(isPlatformAdminId('owner', ''), false);
  assert.equal(isPlatformAdminId('user-a', 'user-ab'), false);
  assert.equal(isPlatformAdminId('user-a', ' user-a, user-b '), true);
});
test('document mutations enforce owner, tenant, role and unexpired matching grants', () => {
  assert.equal(canAccessDocument(member, doc, 'READ'), true);
  for (const operation of ['WRITE', 'DELETE', 'SHARE'] as const) assert.equal(canAccessDocument(member, doc, operation), false);
  assert.equal(canAccessDocument({ ...member, id: 'uploader' }, doc, 'WRITE'), true);
  assert.equal(canAccessDocument({ ...member, role: 'ADMIN' }, doc, 'WRITE'), true);
  assert.equal(canAccessDocument({ ...member, role: 'ADMIN', organizationId: 'org-b' }, doc, 'WRITE'), false);
  assert.equal(canAccessDocument(member, { ...doc, sharing: { permissions: [{ userId: member.id, permission: 'WRITE' }] } }, 'WRITE'), true);
  assert.equal(canAccessDocument(member, { ...doc, sharing: { permissions: [{ userId: member.id, permission: 'WRITE', expiresAt: '2020-01-01' }] } }, 'WRITE'), false);
  assert.equal(canAccessDocument({ ...member, id: 'uploader' }, { ...doc, deletedAt: new Date() }), false);
});
async function parseChunks(chunks: Uint8Array[]) {
  const reader = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }).getReader();
  const events: string[] = [];
  for await (const event of readSSEData(reader)) events.push(event);
  return events;
}
test('SSE preserves Unicode and complete JSON at every possible byte split', async () => {
  const data = JSON.stringify({ choices: [{ delta: { content: 'Hello 世界 👋' } }] });
  const wire = new TextEncoder().encode(`data: ${data}\r\n\r\ndata: [DONE]\n\n`);
  for (let split = 1; split < wire.length; split++) assert.deepEqual(await parseChunks([wire.slice(0, split), wire.slice(split)]), [data, '[DONE]']);
  assert.deepEqual(await parseChunks([...wire].map(byte => new Uint8Array([byte]))), [data, '[DONE]']);
});
test('SSE supports comments/multiline events and reports truncation', async () => {
  assert.deepEqual(await parseChunks([new TextEncoder().encode(': heartbeat\ndata: one\ndata: two\n\n')]), ['one\ntwo']);
  await assert.rejects(parseChunks([new TextEncoder().encode('data: {"unfinished":')]), /ended before/);
});
test('share passwords use salted hashes and links must be active and expiring', async () => {
  const hash = await hashSharePassword('private');
  assert.equal(hash.includes('private'), false);
  assert.equal(await verifySharePassword('private', hash), true);
  assert.equal(await verifySharePassword('wrong', hash), false);
  assert.equal(await verifySharePassword('private', 'legacy-plaintext'), false);
  assert.equal(isShareActive({ isShared: true }), false);
  assert.equal(isShareActive({ isShared: true, expiresAt: '2020-01-01' }), false);
  assert.equal(isShareActive({ isShared: true, expiresAt: new Date(Date.now() + 100000).toISOString() }), true);
});
test('search cache separates hybrid/scoring options and zero thresholds', () => {
  const cache = new VectorSearchCache();
  try {
    cache.set('search', { organizationId: 'a' }, { minScore: 0 }, []);
    assert.deepEqual(cache.get('search', { organizationId: 'a' }, { minScore: 0 }), []);
    assert.equal(cache.get('search', { organizationId: 'a' }, { minScore: 0.1 }), null);
    assert.equal(cache.get('search', { organizationId: 'b' }, { minScore: 0 }), null);
    assert.equal(cache.get('search', { organizationId: 'a' }, { minScore: 0, hybridSearch: true, vectorWeight: 0 }), null);
  } finally { cache.destroy(); }
});
test('webhook leases retry failed events, skip completed events and reject concurrent claims', async () => {
  const state = { id: 'event-row', processed: false, processingStartedAt: null as Date | null };
  const store = { billingEvent: {
    async upsert() { return { ...state }; },
    async updateMany(args: any) {
      if (state.processed || (state.processingStartedAt && state.processingStartedAt >= args.where.OR[1].processingStartedAt.lt)) return { count: 0 };
      state.processingStartedAt = args.data.processingStartedAt; return { count: 1 };
    },
  } };
  const event = { id: 'evt-1', type: 'subscription.updated' };
  const now = new Date();
  const claims = await Promise.all([claimWebhook(store, event, now), claimWebhook(store, event, now)]);
  assert.deepEqual(claims.map(c => c.status).sort(), ['busy', 'claimed']);
  state.processingStartedAt = null; // failed handler releases its lease
  assert.equal((await claimWebhook(store, event, now)).status, 'claimed');
  assert.equal((await claimWebhook(store, event, new Date(now.getTime() + 360000))).status, 'claimed');
  state.processed = true;
  assert.equal((await claimWebhook(store, event, now)).status, 'completed');
});

test('invoice events support both current and legacy subscription references', () => {
  assert.equal(getInvoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub-current' } } }), 'sub-current');
  assert.equal(getInvoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: 'sub-expanded' } } } }), 'sub-expanded');
  assert.equal(getInvoiceSubscriptionId({ subscription: 'sub-legacy' }), 'sub-legacy');
  assert.equal(getInvoiceSubscriptionId({}), null);
});
