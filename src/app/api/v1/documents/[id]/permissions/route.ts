import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessDocument } from '@/lib/security/access-policy';
const schema = z.object({ userId: z.string().min(1), permission: z.enum(['READ', 'WRITE', 'DELETE', 'SHARE']), expiresAt: z.string().datetime().nullable().optional() });
type Context = { params: Promise<{ id: string }> };
async function manage(request: NextRequest, context: Context, method: 'GET' | 'POST' | 'DELETE') {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const document = await prisma.document.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (!canAccessDocument(user, document, 'SHARE')) return NextResponse.json({ error: 'Sharing permission required' }, { status: 403 });
  const sharing = (document.sharing as Record<string, any>) || {};
  const permissions: any[] = sharing.permissions || [];
  if (method === 'GET') return NextResponse.json({ success: true, permissions }, { headers: { 'Cache-Control': 'private, no-store' } });
  const body = await request.json().catch(() => null);
  if (method === 'POST') {
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
    const recipient = await prisma.user.findFirst({ where: { id: parsed.data.userId, organizationId: user.organizationId, deletedAt: null } });
    if (!recipient) return NextResponse.json({ error: 'Recipient must belong to this organization' }, { status: 400 });
    sharing.permissions = [...permissions.filter(p => !(p.userId === recipient.id && p.permission === parsed.data.permission)), {
      id: randomUUID(), ...parsed.data, grantedBy: user.id, grantedAt: new Date().toISOString(),
    }];
  } else {
    const permissionId = body?.permissionId || request.nextUrl.searchParams.get('permissionId');
    if (typeof permissionId !== 'string') return NextResponse.json({ error: 'Permission id required' }, { status: 400 });
    sharing.permissions = permissions.filter(p => p.id !== permissionId);
  }
  const result = await prisma.document.updateMany({ where: { id, updatedAt: document.updatedAt, deletedAt: null }, data: { sharing } });
  if (result.count !== 1) return NextResponse.json({ error: 'Document changed; please retry' }, { status: 409 });
  return NextResponse.json({ success: true, permissions: sharing.permissions });
}
export async function GET(request: NextRequest, context: Context) { return manage(request, context, 'GET'); }
export async function POST(request: NextRequest, context: Context) { return manage(request, context, 'POST'); }
export async function DELETE(request: NextRequest, context: Context) { return manage(request, context, 'DELETE'); }
