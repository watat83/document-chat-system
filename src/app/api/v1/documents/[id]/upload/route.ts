import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { inngest } from '@/lib/inngest/client';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { guardUsage } from '@/lib/billing/usage-guard';
import { UsageType } from '@/lib/usage-tracking';
import { validateFile, getEffectiveMimeType } from '@/lib/file-validation';
import { processingSnapshot, processingTransition, processingTransaction, updateProcessingState, ProcessingConflictError } from '@/lib/documents/processing-state';
import { serializeDocument } from '@/lib/documents/document-response';

/** Attach a private file to an editor-created document and queue durable extraction. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guardDocumentMutation(id, 'WRITE');
  if (denied) return denied;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const storage = supabaseAdmin;
  if (!storage) return NextResponse.json({ error: 'Private document storage is not configured' }, { status: 503 });
  let stagedPath: string | undefined;
  let attached = false;
  try {
    const document = await prisma.document.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (!document.filePath.startsWith('/documents/')) return NextResponse.json({ error: 'This document already has a file attached' }, { status: 409 });
    if (['QUEUED', 'PROCESSING'].includes(processingSnapshot(document.processing).currentStatus)) return NextResponse.json({ error: 'Document is being processed' }, { status: 409 });
    const usageError = await guardUsage(user.organizationId, UsageType.DOCUMENT_PROCESSING);
    if (usageError) return usageError;
    const file = (await request.formData()).get('file');
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'File required' }, { status: 400 });
    const validation = validateFile(file);
    if (!validation.isValid || file.size === 0) return NextResponse.json({ error: validation.error ?? 'Empty files cannot be uploaded' }, { status: 400 });
    const bucket = await storage.storage.getBucket('documents');
    if (bucket.error || bucket.data?.public !== false) return NextResponse.json({ error: 'Documents require a private storage bucket' }, { status: 503 });
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'bin';
    stagedPath = `${user.organizationId}/docs/${id}-${randomUUID()}.${extension}`;
    const uploaded = await storage.storage.from('documents').upload(stagedPath, await file.arrayBuffer(), { contentType: getEffectiveMimeType(validation), upsert: false });
    if (uploaded.error) throw uploaded.error;
    const updated = await processingTransaction(prisma, async tx => {
      const current = await tx.document.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
      if (!current || current.filePath !== document.filePath || ['PROCESSING', 'QUEUED'].includes(processingSnapshot(current.processing).currentStatus)) throw new ProcessingConflictError('Document changed while the file was uploading');
      return tx.document.update({ where: { id, organizationId: user.organizationId, deletedAt: null }, data: { filePath: stagedPath, mimeType: getEffectiveMimeType(validation), size: file.size, lastModified: new Date(), processing: processingTransition(current.processing, 'QUEUED') } });
    });
    attached = true;
    const runId = processingSnapshot(updated.processing).runId;
    try {
      await inngest.send({ name: 'document/process-basic.requested', data: { documentId: id, organizationId: user.organizationId, userId: user.id, runId } });
    } catch (error) {
      await updateProcessingState(id, current => current.runId === runId ? processingTransition(current, 'FAILED', 'Could not schedule file processing') : current, user.organizationId);
      throw error;
    }
    return NextResponse.json({ ...serializeDocument(updated), message: 'File attached; processing queued', processingStatus: 'QUEUED' }, { status: 202 });
  } catch (error) {
    if (stagedPath && !attached) await storage.storage.from('documents').remove([stagedPath]).catch(() => {});
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Document file attachment failed', error);
    return NextResponse.json({ error: 'File attachment or processing scheduling failed' }, { status: 503 });
  }
}
