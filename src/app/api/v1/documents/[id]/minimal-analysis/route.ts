import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { AIServiceManager } from '@/lib/ai/ai-service-manager';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { jsonObject, processingSnapshot, processingTransition, updateProcessingState, updateProcessingDocument, ProcessingConflictError } from '@/lib/documents/processing-state';
import { serializeDocument } from '@/lib/documents/document-response';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const documentId = (await params).id;
  const denied = await guardDocumentMutation(documentId, 'WRITE');
  if (denied) return denied;
  let runId: string | undefined;
  try {
    const { userId } = await auth();
    const user = userId ? await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } }) : null;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (!document.extractedText?.trim()) return NextResponse.json({ error: 'No extracted text available' }, { status: 400 });
    const usageError = await guardUsage(user.organizationId, UsageType.AI_QUERY);
    if (usageError) return usageError;
    const started = await updateProcessingState(documentId, current => {
      if (['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new ProcessingConflictError();
      return processingTransition(current, 'PROCESSING');
    }, user.organizationId);
    runId = processingSnapshot(started.processing).runId ?? undefined;
    const response = await AIServiceManager.getInstance().generateCompletion({
      model: 'balanced', maxTokens: 500, temperature: 0.3,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      messages: [{ role: 'system', content: 'Summarize the supplied document accurately.' }, { role: 'user', content: document.extractedText.slice(0, 4000) }],
      metadata: { organizationId: user.organizationId, userId: user.id },
    });
    if (!response.content?.trim()) throw new Error('Provider returned an empty summary');
    const updated = await updateProcessingDocument(documentId, user.organizationId, current => ({
      summary: response.content,
      analysis: { ...jsonObject(current.analysis), minimalSummary: { model: response.model, analyzedAt: new Date().toISOString() } },
      processing: processingTransition(current.processing, 'COMPLETED'),
    }), runId);
    const result = serializeDocument(updated);
    return NextResponse.json({ success: true, message: 'Summary completed', documentId, document: result, aiData: result.aiData });
  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (runId) await updateProcessingState(documentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Summary failed')).catch(() => undefined);
    return NextResponse.json({ success: false, error: 'Document summary unavailable' }, { status: 503 });
  }
}
