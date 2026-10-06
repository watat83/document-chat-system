import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessDocument } from './access-policy';
export async function guardDocumentMutation(documentId: string, operation: 'WRITE' | 'DELETE' | 'SHARE' = 'WRITE') {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    if (!canAccessDocument(user, document, operation)) return NextResponse.json({ error: `${operation} permission required` }, { status: 403 });
    return null;
  } catch (error) {
    console.error('Document access verification failed', error);
    return NextResponse.json({ error: 'Access verification unavailable' }, { status: 503 });
  }
}
