import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { downloadFileWithFallback } from '@/lib/storage/path-utils';
import { canAccessDocument } from '@/lib/security/access-policy';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { jsonObject, processingSnapshot, processingTransition, updateProcessingState, processingTransaction, ProcessingConflictError, assertProcessingRun } from '@/lib/documents/processing-state';
import { serializeDocument } from '@/lib/documents/document-response';

const processSchema = z.object({
  documentId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  operation: z.enum(['summary', 'extraction', 'analysis', 'qa']).default('summary'),
  prompt: z.string().max(200000).optional(),
  model: z.string().max(200).optional(),
  forceReprocess: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let activeDocumentId: string | undefined;
  let activeRunId: string | undefined;
  try {
    const parsed = processSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;
    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } });
    if (!user || (body.organizationId && body.organizationId !== user.organizationId)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const document = await prisma.document.findFirst({ where: { id: body.documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (!canAccessDocument(user, document, 'WRITE')) return NextResponse.json({ error: 'Write permission required' }, { status: 403 });
    const currentProcessing = processingSnapshot(document.processing);
    if (['PROCESSING', 'QUEUED'].includes(currentProcessing.currentStatus)) return NextResponse.json({ error: 'Document is already processing' }, { status: 409 });
    const results = jsonObject(jsonObject(document.analysis).processingResults);
    const cachedResult = jsonObject(results[body.operation]);
    if (!body.forceReprocess && !body.prompt && !body.model && typeof cachedResult.content === 'string') return NextResponse.json({ id: document.id, content: cachedResult.content, operation: body.operation, status: currentProcessing.currentStatus, metadata: cachedResult.metadata, document: serializeDocument(document) });
    for (const type of [UsageType.DOCUMENT_PROCESSING, UsageType.AI_QUERY]) {
      const usageError = await guardUsage(user.organizationId, type);
      if (usageError) return usageError;
    }
    const { data, error } = await downloadFileWithFallback(document.filePath, user.organizationId);
    if (error || !data) throw new Error('Document file unavailable');
    const manager = AIServiceManager.getInstance();
    await manager.initialize();
    const adapter = manager.getOpenRouterAdapter();
    if (!adapter) throw new Error('Document processing provider unavailable');
    const started = await updateProcessingState(document.id, current => {
      if (['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new ProcessingConflictError();
      return processingTransition(current, 'PROCESSING');
    });
    activeDocumentId = document.id;
    activeRunId = processingSnapshot(started.processing).runId ?? undefined;
    const response = await adapter.processDocument({ signal: request.signal, documentId: document.id, documentData: Buffer.from(await data.arrayBuffer()), fileName: document.name, mimeType: document.mimeType, operation: body.operation, prompt: body.prompt, model: body.model, metadata: { organizationId: user.organizationId, userId: user.id } });
    // Store only the operation's actual result. Summary/QA must not replace extracted text.
    const updated = await processingTransaction(prisma, async tx => {
      const current = await tx.document.findFirst({ where: { id: document.id, organizationId: user.organizationId, deletedAt: null } });
      if (!current) throw new Error('Document not found');
      assertProcessingRun(current.processing, activeRunId);
      const analysis = jsonObject(current.analysis);
      return tx.document.update({ where: { id: document.id }, data: {
        ...(body.operation === 'extraction' && { extractedText: response.extractedText }),
        ...(body.operation === 'summary' && { summary: response.extractedText }),
        analysis: JSON.parse(JSON.stringify({ ...analysis, processingResults: { ...jsonObject(analysis.processingResults), [body.operation]: { content: response.extractedText, metadata: response.metadata, processedAt: new Date().toISOString() } } })),
      } });
    });
    await updateProcessingState(document.id, current => (activeRunId && current.runId !== activeRunId) || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'COMPLETED'));
    const latest = await prisma.document.findUnique({ where: { id: document.id } });
    return NextResponse.json({ id: document.id, content: response.extractedText, summary: body.operation === 'summary' ? response.extractedText : updated.summary, status: latest ? processingSnapshot(latest.processing).currentStatus : 'COMPLETED', metadata: response.metadata, operation: body.operation, document: serializeDocument(latest ?? updated) });
  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    if (activeDocumentId) await updateProcessingState(activeDocumentId, current => (activeRunId && current.runId !== activeRunId) || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Document processing failed')).catch(() => undefined);
    console.error('Document processing failed', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ error: 'Document processing unavailable' }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const documentId = request.nextUrl.searchParams.get('documentId');
  if (!documentId) return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  try {
    const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } });
    if (!user) return NextResponse.json({ error: 'Account unavailable' }, { status: 403 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document || !canAccessDocument(user, document, 'READ')) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const result = serializeDocument(document);
    return NextResponse.json({ id: document.id, status: result.status, progress: result.progress, content: document.extractedText, summary: document.summary, processedAt: result.processedAt, error: result.processingError, document: result });
  } catch {
    return NextResponse.json({ error: 'Processing status unavailable' }, { status: 503 });
  }
}
