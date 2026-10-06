import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { canAccessDocument } from '@/lib/security/access-policy';
import { hashSharePassword } from '@/lib/security/share-password';
const schema = z.object({
  expiresAt: z.string().datetime().optional(), password: z.string().max(256).optional(),
  allowDownload: z.boolean().optional(), allowPreview: z.boolean().optional(),
  trackViews: z.boolean().optional(), isShared: z.boolean().optional(),
});
type Context = { params: Promise<{ id: string }> };
async function manage(request: NextRequest, context: Context, method: string) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const document = await prisma.document.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  if (!canAccessDocument(user, document, 'SHARE')) return NextResponse.json({ error: 'Sharing permission required' }, { status: 403 });
  const sharing = (document.sharing as Record<string, any>) || {};
  if (method === 'GET') {
    const { passwordHash: _hash, password: _legacy, ...share } = sharing.share || {};
    return NextResponse.json({ success: true, share: sharing.share ? { ...share, hasPassword: !!sharing.share.passwordHash } : null });
  }
  if (method === 'DELETE') sharing.share = null;
  else {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid sharing settings' }, { status: 400 });
    if (method === 'PATCH' && !sharing.share) return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    const settings = parsed.data;
    const expiresAt = settings.expiresAt || sharing.share?.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
    if (Date.parse(expiresAt) <= Date.now() || Date.parse(expiresAt) > Date.now() + 30 * 86400000) return NextResponse.json({ error: 'Expiry must be within the next 30 days' }, { status: 400 });
    const shareToken = method === 'POST' ? randomBytes(32).toString('hex') : sharing.share.shareToken;
    const passwordHash = settings.password !== undefined ? (settings.password ? await hashSharePassword(settings.password) : null) : (method === 'PATCH' ? sharing.share.passwordHash : null);
    sharing.share = { ...(method === 'PATCH' ? sharing.share : {}), id: shareToken, shareToken,
      shareUrl: `/shared/${shareToken}`, sharedBy: user.id, sharedAt: new Date().toISOString(),
      expiresAt, isShared: settings.isShared ?? true, allowDownload: settings.allowDownload ?? sharing.share?.allowDownload ?? true,
      allowPreview: settings.allowPreview ?? sharing.share?.allowPreview ?? true, trackViews: settings.trackViews ?? false,
      passwordHash, viewCount: sharing.share?.viewCount ?? 0 };
    delete sharing.share.password;
  }
  const updated = await prisma.document.updateMany({ where: { id, updatedAt: document.updatedAt, deletedAt: null }, data: { sharing } });
  if (updated.count !== 1) return NextResponse.json({ error: 'Document changed; please retry' }, { status: 409 });
  const { passwordHash: _hash, password: _legacy, ...share } = sharing.share || {};
  return NextResponse.json({ success: true, share: sharing.share ? { ...share, hasPassword: !!sharing.share.passwordHash } : null });
}
export async function GET(request: NextRequest, context: Context) { return manage(request, context, 'GET'); }
export async function POST(request: NextRequest, context: Context) { return manage(request, context, 'POST'); }
export async function PATCH(request: NextRequest, context: Context) { return manage(request, context, 'PATCH'); }
export async function DELETE(request: NextRequest, context: Context) { return manage(request, context, 'DELETE'); }
