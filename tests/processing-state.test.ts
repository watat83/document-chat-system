import { assertProcessingRun, processingSnapshot, processingTransaction, processingTransition, updateProcessingDocument } from '@/lib/documents/processing-state';
import { db } from '@/lib/db';

jest.mock('@/lib/db', () => ({ db: { $transaction: jest.fn(), document: { findFirst: jest.fn(), update: jest.fn() } } }));
beforeEach(() => {
  jest.clearAllMocks();
  (db.$transaction as jest.Mock).mockImplementation(async callback => callback(db));
});

test('a restart receives a different generation and rejects an older result', () => {
  const first = processingTransition({}, 'QUEUED');
  const processing = processingTransition(first, 'PROCESSING');
  expect(processing.runId).toBe(first.runId);
  const next = processingTransition(processingTransition(processing, 'CANCELLED'), 'QUEUED');
  expect(next.runId).not.toBe(first.runId);
  expect(() => assertProcessingRun(next, first.runId!)).toThrow('superseded');
  expect(() => assertProcessingRun(next, next.runId!)).not.toThrow();
});

test('partial analysis is never marked as a successful event', () => {
  expect(processingTransition({}, 'PARTIAL').events.at(-1)?.success).toBe(false);
});

test('a serialization conflict retries the database operation', async () => {
  const operation = jest.fn().mockResolvedValue('stored');
  (db.$transaction as jest.Mock).mockRejectedValueOnce({ code: 'P2034' }).mockImplementationOnce(async callback => callback(db));
  await expect(processingTransaction(db, operation)).resolves.toBe('stored');
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(operation).toHaveBeenCalledTimes(1);
  expect((db.$transaction as jest.Mock).mock.calls[1][1]).toEqual({ isolationLevel: 'Serializable' });
});

test('database retry stops after three conflicts', async () => {
  (db.$transaction as jest.Mock).mockRejectedValue({ code: 'P2034' });
  await expect(processingTransaction(db, jest.fn())).rejects.toEqual({ code: 'P2034' });
  expect(db.$transaction).toHaveBeenCalledTimes(3);
});

test('result writes are tenant scoped and reject a superseded generation', async () => {
  (db.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-a', processing: { currentStatus: 'PROCESSING', runId: 'new-run' } });
  const transform = jest.fn();
  await expect(updateProcessingDocument('doc-a', 'tenant-a', transform, 'old-run')).rejects.toThrow('superseded');
  expect(db.document.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-a', organizationId: 'tenant-a', deletedAt: null } });
  expect(transform).not.toHaveBeenCalled();
  expect(db.document.update).not.toHaveBeenCalled();
});

test('current results preserve latest event history supplied to the transform', async () => {
  const processing = { currentStatus: 'PROCESSING', runId: 'run-a', events: [{ id: 'concurrent-progress' }] };
  (db.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-a', processing });
  await updateProcessingDocument('doc-a', 'tenant-a', current => ({ processing: processingTransition(current.processing, 'COMPLETED') }), 'run-a');
  const saved = (db.document.update as jest.Mock).mock.calls[0][0].data.processing;
  expect(processingSnapshot(saved).events[0]).toEqual(processing.events[0]);
  expect(processingSnapshot(saved).currentStatus).toBe('COMPLETED');
});
