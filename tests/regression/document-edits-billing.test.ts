import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySectionEdits } from '../../src/lib/documents/section-edits';
import { getSubscriptionPeriod } from '../../src/lib/billing/subscription-period';

test('section edits follow persisted IDs, preserve metadata and allow clearing content', () => {
  const sections = [
    { id: 'section-b', title: 'Second', content: 'before', pageNumber: 4, level: 2 },
    { id: 'section-a', title: 'First', content: 'keep', pageNumber: 1, level: 1 },
  ];
  const result = applySectionEdits(sections, { 'section-b': '', missing: 'ignore' });
  assert.deepEqual(result[0], { ...sections[0], content: '' });
  assert.equal(result[1], sections[1]);
  assert.equal(sections[0].content, 'before');
  assert.deepEqual(applySectionEdits([], { missing: 'ignore' }), []);
});

test('billing periods use current item fields and accept older signed event shapes', () => {
  const current = getSubscriptionPeriod({ items: { data: [{ current_period_start: 100, current_period_end: 200 }] }, current_period_start: 1, current_period_end: 2 });
  assert.equal(current.start.getTime(), 100000);
  assert.equal(current.end.getTime(), 200000);
  assert.deepEqual(getSubscriptionPeriod({ current_period_start: 100, current_period_end: 200 }), current);
  for (const source of [{}, { items: { data: [] } }, { current_period_start: NaN, current_period_end: 200 }, { current_period_start: 200, current_period_end: 100 }]) {
    assert.throws(() => getSubscriptionPeriod(source), /valid billing period/);
  }
});

test('document updates retain section metadata and allow clearing entities', async () => {
  const { DocumentUpdateSchema } = await import('../../src/lib/documents/update-schema');
  const value = DocumentUpdateSchema.parse({ content: { sections: [{ id: 'stable-id', title: 'Title', content: '', pageNumber: 7, parentId: null }], tables: [] }, entities: [], organizationId: 'foreign' });
  assert.equal(value.content?.sections?.[0].id, 'stable-id');
  assert.equal(value.content?.sections?.[0].pageNumber, 7);
  assert.deepEqual(value.entities, []);
  assert.equal('organizationId' in value, false);
  assert.equal(DocumentUpdateSchema.safeParse({ name: '', documentType: 'invented' }).success, false);
});

test('multiple notification tabs remain connected when one tab disconnects', async () => {
  const { registerNotificationConnection, sendNotificationToUser } = await import('../../src/lib/notification-stream');
  const first: Uint8Array[] = [], second: Uint8Array[] = [];
  let closeFirst = () => {}, closeSecond = () => {};
  new ReadableStream<Uint8Array>({ start(controller) { const enqueue = controller.enqueue.bind(controller); controller.enqueue = chunk => { first.push(chunk); enqueue(chunk); }; closeFirst = registerNotificationConnection('tab-user', controller); } });
  new ReadableStream<Uint8Array>({ start(controller) { const enqueue = controller.enqueue.bind(controller); controller.enqueue = chunk => { second.push(chunk); enqueue(chunk); }; closeSecond = registerNotificationConnection('tab-user', controller); } });
  assert.equal(sendNotificationToUser('tab-user', { id: 'one' }), true);
  closeFirst();
  assert.equal(sendNotificationToUser('tab-user', { id: 'two' }), true);
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  closeSecond();
  assert.equal(sendNotificationToUser('tab-user', { id: 'three' }), false);
});

test('created documents use canonical JSON fields, byte sizes and stable section IDs', async () => {
  const { DocumentCreatorService } = await import('../../src/lib/documents/document-creator');
  const content = '# Title\n世界';
  const document = await DocumentCreatorService.getInstance().createDocument({ name: 'New document', type: 'CONTRACT', content, organizationId: 'tenant-a', createdBy: 'user-a', tags: [], urgencyLevel: 'medium', complexityScore: 5, isEditable: true });
  assert.equal(document.size, new TextEncoder().encode(content).length);
  assert.equal(document.processing.currentStatus, 'COMPLETED');
  assert.equal(document.organizationId, 'tenant-a');
  assert.equal(document.uploadedById, 'user-a');
  assert.equal(document.documentType, 'CONTRACT');
  assert.ok(document.content.sections[0].id);
  assert.equal(document.content.sections[0].content.trim(), '世界');
});

test('document responses omit share credentials and do not invent analysis results', async () => {
  const { serializeDocument } = await import('../../src/lib/documents/document-response');
  const timestamp = new Date('2026-10-06T00:00:00Z');
  const result = serializeDocument({ id: 'doc-a', name: 'Document', size: 0, mimeType: 'text/plain', uploadDate: timestamp, updatedAt: timestamp, createdAt: timestamp, deletedAt: null, content: null, entities: null, processing: {}, analysis: {}, sharing: { share: { password: 'legacy-secret', passwordHash: 'hash-secret', isShared: true } } } as never);
  assert.equal(result.sharing.share?.hasPassword, true);
  assert.equal('passwordHash' in result.sharing.share!, false);
  assert.equal('password' in result.sharing.share!, false);
  assert.equal(result.aiData.processedAt, undefined);
  assert.equal(result.aiData.analysis.confidence, undefined);
  assert.equal(result.securityAnalysis, undefined);
});

test('processing transitions preserve history, zero progress and failed event flags', async () => {
  const { processingSnapshot, processingTransition } = await import('../../src/lib/documents/processing-state');
  const legacy = { status: 'PROCESSING', progress: 0, history: [{ id: 'old-event', success: false }], metadata: { source: 'upload' } };
  assert.equal(processingSnapshot(legacy).currentStatus, 'PROCESSING');
  const failed = processingTransition(legacy, 'FAILED', 'Provider unavailable', '2026-10-06T00:00:00Z');
  assert.equal(failed.progress, 0);
  assert.deepEqual(failed.events[0], legacy.history[0]);
  assert.equal(failed.events[1].success, false);
  assert.equal(failed.events[1].eventType, 'FAILED');
  assert.deepEqual(failed.metadata, legacy.metadata);
  const cancelled = processingTransition(failed, 'CANCELLED');
  assert.equal(cancelled.currentStatus, 'CANCELLED');
  assert.equal(cancelled.events.at(-1)?.success, false);
});
