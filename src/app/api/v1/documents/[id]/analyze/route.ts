import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { inngest } from '@/lib/inngest/client';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { jsonObject, processingSnapshot, processingTransition, updateProcessingState, ProcessingConflictError } from '@/lib/documents/processing-state';

const schema = z.object({ options: z.object({
  includeSecurityAnalysis: z.boolean().default(true), includeEntityExtraction: z.boolean().default(true),
  includeQualityScoring: z.boolean().default(true), priority: z.enum(['low', 'normal', 'high']).default('normal'),
}).default({}) }).default({});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const documentId = (await params).id;
  const denied = await guardDocumentMutation(documentId, 'WRITE');
  if (denied) return denied;
  let runId: string | undefined;
  try {
    const { userId } = await auth();
    const user = userId ? await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } }) : null;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const text = await request.text();
    const parsed = schema.safeParse(text ? JSON.parse(text) : {});
    if (!parsed.success) return NextResponse.json({ error: 'Invalid analysis options' }, { status: 400 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const sections = jsonObject(document.content).sections;
    const hasEditorContent = Array.isArray(sections) && sections.some(section => typeof jsonObject(section).content === 'string' && String(jsonObject(section).content).trim());
    if (!document.filePath && !document.extractedText?.trim() && !hasEditorContent) return NextResponse.json({ error: 'Document has no content to analyze' }, { status: 400 });
    const usageError = await guardUsage(user.organizationId, UsageType.DOCUMENT_PROCESSING);
    if (usageError) return usageError;
    const queued = await updateProcessingState(documentId, current => {
      if (['PROCESSING', 'QUEUED'].includes(current.currentStatus)) throw new ProcessingConflictError();
      return processingTransition(current, 'QUEUED');
    }, user.organizationId);
    runId = processingSnapshot(queued.processing).runId ?? undefined;
    const { ids } = await inngest.send({ name: 'document/process.analyze', data: { documentId, organizationId: user.organizationId, userId: user.id, runId, options: parsed.data.options, metadata: { hasFile: !!document.filePath, hasEditorContent, documentType: document.documentType } } });
    return NextResponse.json({ success: true, message: 'Analysis queued', documentId, analysisJobId: ids[0], status: 'QUEUED', analysisOptions: parsed.data.options }, { status: 202 });
  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (runId) await updateProcessingState(documentId, current => current.runId !== runId || current.currentStatus === 'CANCELLED' ? current : processingTransition(current, 'FAILED', 'Unable to queue analysis')).catch(() => undefined);
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid JSON' : 'Analysis unavailable' }, { status: error instanceof SyntaxError ? 400 : 503 });
  }
}
