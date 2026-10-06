import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const path = request.nextUrl.searchParams.get('path');
  if (!path || !path.startsWith(`${user.organizationId}/`) || path.split('/').some(p => p === '.' || p === '..') || path.includes('\\')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  const { data, error } = await supabaseAdmin.storage.from('documents').download(path);
  if (error || !data) return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
  return new NextResponse(data, { headers: { 'Content-Type': data.type || 'application/octet-stream',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'attachment' } });
}
