import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessDocument } from '@/lib/security/access-policy';
import { getPinecone } from '@/lib/ai/services/pinecone-client';
import { defaultNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager';
import { defaultVectorSearchCache } from '@/lib/ai/services/vector-search-cache';
const schema = z.object({ documentId: z.string().min(1).optional(), deleteAll: z.boolean().optional() })
  .refine(d => !!d.documentId !== !!d.deleteAll, 'Provide either documentId or deleteAll');
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { documentId, deleteAll } = parsed.data;
  if (deleteAll && !['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Organization administrator access required' }, { status: 403 });
  try {
    if (documentId) {
      const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
      if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      if (!canAccessDocument(user, document, 'WRITE')) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { namespace } = await defaultNamespaceManager.getOrCreateNamespace(user.organizationId);
    const index = getPinecone().index(process.env.PINECONE_INDEX_NAME!).namespace(namespace);
    if (documentId) await index.deleteMany({ documentId: { $eq: documentId }, organizationId: { $eq: user.organizationId } });
    else await index.deleteAll();
    // Clear database references only after the vector store acknowledges deletion.
    await prisma.document.updateMany({ where: { organizationId: user.organizationId, ...(documentId ? { id: documentId } : {}) }, data: { embeddings: {} } });
    if (process.env.ENABLE_PGVECTOR_FALLBACK === 'true') {
      if (documentId) await prisma.$executeRaw`DELETE FROM document_vectors WHERE organization_id = ${user.organizationId} AND document_id = ${documentId}`;
      else await prisma.$executeRaw`DELETE FROM document_vectors WHERE organization_id = ${user.organizationId}`;
    }
    defaultVectorSearchCache.clear();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vector deletion failed', error);
    return NextResponse.json({ error: 'Vector deletion failed; please retry' }, { status: 503 });
  }
}
