import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { jsonObject, processingSnapshot, processingTransition, processingTransaction, ProcessingConflictError } from '@/lib/documents/processing-state';
import { serializeDocument } from '@/lib/documents/document-response';

/** Describe available text without presenting heuristic guesses as AI findings. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const documentId = (await params).id;
  const denied = await guardDocumentMutation(documentId, 'WRITE');
  if (denied) return denied;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null }, select: { organizationId: true } });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  try {
    const updated = await processingTransaction(prisma, async tx => {
      const current = await tx.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
      if (!current) throw new Error('Document not found');
      const state = processingSnapshot(current.processing);
      if (['QUEUED', 'PROCESSING'].includes(state.currentStatus)) throw new ProcessingConflictError();
      const text = current.extractedText?.trim();
      if (!text) throw new Error('No extracted text available');
      const content = jsonObject(current.content);
      return tx.document.update({ where: { id: documentId }, data: {
        content: { ...content, ...(!Array.isArray(content.sections) || !content.sections.length ? { sections: [{ id: randomUUID(), title: 'Document Content', content: text, pageNumber: 1 }] } : {}) },
        analysis: { ...jsonObject(current.analysis), textStatistics: { characters: text.length, words: text.split(/\s+/).length, analyzedAt: new Date().toISOString(), method: 'text-statistics' } },
        processing: { ...processingTransition(state, 'PARTIAL'), unavailableOperations: ['ai-analysis'], progress: 100 },
      }, include: { folder: { select: { id: true, name: true } }, uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } } } });
    });
    const document = serializeDocument(updated);
    return NextResponse.json({ success: true, message: 'Text statistics prepared; AI analysis was not performed', documentId, document, aiData: document.aiData });
  } catch (error) {
    if (error instanceof ProcessingConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === 'Document not found') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message === 'No extracted text available') return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Text statistics failed:', error);
    return NextResponse.json({ error: 'Text statistics unavailable' }, { status: 500 });
  }
}
