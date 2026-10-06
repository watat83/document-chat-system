import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { EntityType } from '@/types/documents';
import { guardDocumentMutation } from '@/lib/security/document-route-guard';
import { jsonObject, processingTransaction } from '@/lib/documents/processing-state';

const entityFields = z.object({
  text: z.string().min(1).max(10000), type: z.nativeEnum(EntityType),
  confidence: z.number().min(0).max(1),
  startOffset: z.number().int().nonnegative(), endOffset: z.number().int().nonnegative(),
  context: z.string().max(20000).nullable().optional(),
});
const createEntitySchema = entityFields.refine(value => value.endOffset > value.startOffset, { message: 'endOffset must be greater than startOffset' });
const querySchema = z.object({ type: z.nativeEnum(EntityType).optional(), minConfidence: z.coerce.number().min(0).max(1).default(0), limit: z.coerce.number().int().min(1).max(1000).default(100) });
const storedEntity = entityFields.extend({ id: z.string().min(1) }).passthrough();
function readEntities(value: unknown) {
  const entities = jsonObject(value).entities;
  return Array.isArray(entities) ? entities.flatMap(entity => { const parsed = storedEntity.safeParse(entity); return parsed.success ? [parsed.data] : []; }) : [];
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const documentId = (await props.params).id;
  const denied = await guardDocumentMutation(documentId, 'READ');
  if (denied) return denied;
  try {
    const { userId } = await auth();
    const user = userId ? await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } }) : null;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid entity filters' }, { status: 400 });
    const document = await prisma.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null }, select: { entities: true } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const all = readEntities(document.entities);
    const entities = all.filter(entity => (!parsed.data.type || entity.type === parsed.data.type) && entity.confidence >= parsed.data.minConfidence).sort((a, b) => b.confidence - a.confidence || a.startOffset - b.startOffset).slice(0, parsed.data.limit);
    const byType: Record<string, number> = {};
    for (const entity of all) byType[entity.type] = (byType[entity.type] ?? 0) + 1;
    return NextResponse.json({ success: true, entities, count: entities.length, summary: { totalEntities: all.length, byType, averageConfidence: all.length ? all.reduce((sum, entity) => sum + entity.confidence, 0) / all.length : 0 } });
  } catch { return NextResponse.json({ error: 'Unable to fetch document entities' }, { status: 503 }); }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const documentId = (await props.params).id;
  const denied = await guardDocumentMutation(documentId, 'WRITE');
  if (denied) return denied;
  try {
    const { userId } = await auth();
    const user = userId ? await prisma.user.findFirst({ where: { clerkId: userId, deletedAt: null } }) : null;
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = createEntitySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid entity', details: parsed.error.flatten() }, { status: 400 });
    const entity = { ...parsed.data, id: randomUUID(), createdAt: new Date().toISOString() };
    const saved = await processingTransaction(prisma, async tx => {
      const document = await tx.document.findFirst({ where: { id: documentId, organizationId: user.organizationId, deletedAt: null } });
      if (!document) return false;
      if (document.extractedText && entity.endOffset > document.extractedText.length) throw new RangeError('Entity offsets exceed document text');
      const current = jsonObject(document.entities);
      const entities = [...(Array.isArray(current.entities) ? current.entities : []), entity];
      await tx.document.update({ where: { id: documentId }, data: { entities: { ...current, entities, totalCount: entities.length } } });
      return true;
    });
    return saved ? NextResponse.json({ success: true, entity }, { status: 201 }) : NextResponse.json({ error: 'Document not found' }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof RangeError ? error.message : 'Unable to add entity' }, { status: error instanceof SyntaxError || error instanceof RangeError ? 400 : 503 }); }
}
