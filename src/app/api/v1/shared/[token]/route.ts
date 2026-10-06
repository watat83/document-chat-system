import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';
import { isShareActive, verifySharePassword } from '@/lib/security/share-password';
import { checkIPRateLimit } from '@/lib/rate-limit';
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await checkIPRateLimit(request, 20, 60000);
  if (!limit.success) return NextResponse.json({ error: 'Please try again later' }, { status: 429 });
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: 'Link unavailable' }, { status: 404 });
  const document = await prisma.document.findFirst({ where: { deletedAt: null, sharing: { path: ['share', 'shareToken'], equals: token } } });
  const share = (document?.sharing as any)?.share;
  if (!document || !isShareActive(share)) return NextResponse.json({ error: 'Link expired or unavailable' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (share.password || (share.passwordHash && (typeof body.password !== 'string' || body.password.length > 256 || !await verifySharePassword(body.password, share.passwordHash)))) return NextResponse.json({ error: 'Password required or incorrect' }, { status: 401 });
  if (body.download) {
    if (!share.allowDownload) return NextResponse.json({ error: 'Downloads disabled' }, { status: 403 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
    const { data, error } = await supabaseAdmin.storage.from('documents').download(document.filePath);
    if (error || !data) return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
    const filename = document.name.replace(/[\r\n"\\]/g, '_');
    return new NextResponse(data, { headers: { 'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (!share.allowPreview) return NextResponse.json({ error: 'Preview disabled' }, { status: 403 });
  return NextResponse.json({ name: document.name, text: document.extractedText || 'Text preview is not available.', allowDownload: share.allowDownload }, { headers: { 'Cache-Control': 'no-store' } });
}
