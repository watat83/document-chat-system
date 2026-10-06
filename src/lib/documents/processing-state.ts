import { randomUUID } from 'node:crypto';
import { ProcessingStatus } from '@/types/documents';
import type { Prisma, PrismaClient, Document } from '@prisma/client';

export function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

/** Read both historical processing JSON and the current canonical status fields. */
export function processingSnapshot(value: unknown) {
  const current = jsonObject(value);
  const status = current.currentStatus ?? current.status;
  const currentStatus = Object.values(ProcessingStatus).find(item => item === status) ?? ProcessingStatus.PENDING;
  const events = Array.isArray(current.events) ? current.events : Array.isArray(current.history) ? current.history : [];
  return { ...current, runId: typeof current.runId === 'string' ? current.runId : null, currentStatus, progress: typeof current.progress === 'number' ? current.progress : 0, events };
}

export function processingTransition(value: unknown, status: ProcessingStatus, error?: string, timestamp = new Date().toISOString()) {
  const current = processingSnapshot(value);
  return {
    ...current,
    ...(['PROCESSING', 'QUEUED'].includes(status) && { runId: ['PROCESSING', 'QUEUED'].includes(current.currentStatus) && typeof current.runId === 'string' ? current.runId : randomUUID() }),
    currentStatus: status,
    progress: status === 'COMPLETED' ? 100 : status === 'PROCESSING' ? 0 : current.progress,
    currentStep: null,
    estimatedCompletion: null,
    events: [...current.events, {
      id: randomUUID(), userId: null, event: error ?? `Processing ${status.toLowerCase()}`,
      eventType: status === 'PROCESSING' ? 'STARTED' : status,
      success: !['FAILED', 'CANCELLED', 'PARTIAL'].includes(status), error: error ?? null,
      timestamp, duration: null, metadata: null,
    }],
  };
}

export function assertProcessingRun(value: unknown, expectedRunId?: string) {
  const current = processingSnapshot(value);
  if (current.currentStatus === 'CANCELLED' || (expectedRunId && current.runId !== expectedRunId)) {
    const error = new Error('Document processing cancelled or superseded'); error.name = 'AbortError'; throw error;
  }
}

/** Preserve event identities and avoid duplicating the historical projection. */
export function mergeProcessingEvents(existing: Prisma.JsonValue[], added: Prisma.JsonValue[]) {
  const seen = new Set<string>();
  return [...existing, ...added].filter(event => {
    const value = jsonObject(event);
    const text = value.event ?? value.message;
    const key = value.timestamp && text ? JSON.stringify([value.timestamp, text, value.success]) : JSON.stringify(value.id ?? value);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export class ProcessingConflictError extends Error {
  constructor(message = 'Document is already being processed') { super(message); this.name = 'ProcessingConflictError'; }
}

/** Retry database conflicts only; never repeat a paid provider request. */
export async function processingTransaction<T>(client: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(operation, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034') throw error;
    }
  }
}

/** Merge a result with the latest document while respecting durable cancellation. */
export async function updateProcessingDocument(documentId: string, organizationId: string, transform: (document: Document) => Prisma.DocumentUpdateInput, expectedRunId?: string) {
  const { db } = await import('@/lib/db');
  return processingTransaction(db, async tx => {
    const current = await tx.document.findFirst({ where: { id: documentId, organizationId, deletedAt: null } });
    if (!current) throw new Error('Document not found');
    assertProcessingRun(current.processing, expectedRunId);
    return tx.document.update({ where: { id: documentId }, data: transform(current), include: {
      folder: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    } });
  });
}

/** Update only processing JSON inside a retryable serializable transaction. */
export async function updateProcessingState(documentId: string, transform: (current: ReturnType<typeof processingSnapshot>) => Prisma.InputJsonValue, organizationId?: string) {
  const { db } = await import('@/lib/db');
  return processingTransaction(db, async tx => {
        const document = await tx.document.findFirst({ where: { id: documentId, ...(organizationId && { organizationId }), deletedAt: null }, select: { processing: true } });
        if (!document) throw new Error('Document not found');
        return tx.document.update({ where: { id: documentId }, data: { processing: transform(processingSnapshot(document.processing)) } });
  });
}
