import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { inngest } from '@/lib/inngest/client';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { jsonObject, processingSnapshot, processingTransition, updateProcessingState, ProcessingConflictError } from '@/lib/documents/processing-state';

const schema = z.object({
  includeBasic: z.boolean().default(true),
  analysis: z.object({
    extractEntities: z.boolean().default(true), securityAnalysis: z.boolean().default(true),
    contractAnalysis: z.boolean().default(true), complianceCheck: z.boolean().default(true),
    generateEmbeddings: z.boolean().default(true), qualityScoring: z.boolean().default(true),
  }).default({}),
  options: z.object({ overwrite: z.boolean().default(false), priority: z.enum(['low', 'normal', 'high']).default('normal') }).default({}),
});

/** Keep provider calls in durable jobs rather than a long serverless HTTP request. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const documentId = (await params).id;
  const denied = await guardDocumentMutation(documentId, 'WRITE');
  if (denied) return denied;
  let runId: string | undefined;
  try {
    const { userId } = await auth();
    const user = userId ? await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } }) : null;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.text();
    const parsed = schema.safeParse(body ? JSON.parse(body) : {});
    if (!parsed.success) return NextResponse.json({ error: 'Invalid processing options', details: parsed.error.flatten() }, { status: 400 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const sections = jsonObject(document.content).sections;
    const hasEditorContent = Array.isArray(sections) && sections.some(section => typeof jsonObject(section).content === 'string' && String(jsonObject(section).content).trim());
    if (!document.extractedText?.trim() && !hasEditorContent && (!parsed.data.includeBasic || !document.filePath)) return NextResponse.json({ error: 'No content available for processing' }, { status: 400 });
    const usageError = await guardUsage(user.organizationId, UsageType.DOCUMENT_PROCESSING);
    if (usageError) return usageError;
    const queued = await updateProcessingState(documentId, current => {
      if (['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new ProcessingConflictError();
      return processingTransition(current, 'QUEUED');
    }, user.organizationId);
    runId = processingSnapshot(queued.processing).runId ?? undefined;
    const { ids } = await inngest.send({ name: 'document/process-full.requested', data: {
      documentId, organizationId: user.organizationId, userId: user.id, runId,
      analysis: parsed.data.analysis, options: { forceReprocess: parsed.data.options.overwrite, priority: parsed.data.options.priority },
      metadata: { hasEditorContent },
    } });
    return NextResponse.json({ success: true, message: 'Full processing queued', documentId, jobId: ids[0], status: 'QUEUED' }, { status: 202 });
  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (runId) await updateProcessingState(documentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Unable to queue full processing')).catch(() => undefined);
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid JSON' : 'Full processing unavailable' }, { status: error instanceof SyntaxError ? 400 : 503 });
  }
}
