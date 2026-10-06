import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { conversationSchema } from '@/lib/chat/conversation-schema';
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const where = { organizationId: user.organizationId, userId: user.id };
  if (request.nextUrl.searchParams.get('latest') === 'true') {
    return NextResponse.json({ conversation: await prisma.conversation.findFirst({ where, orderBy: { updatedAt: 'desc' } }) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const conversations = await prisma.conversation.findMany({ where, select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 50 });
  return NextResponse.json({ conversations }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = conversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  const conversation = await prisma.conversation.create({ data: { organizationId: user.organizationId, userId: user.id, title: parsed.data.title || 'New conversation', messages: parsed.data.messages as any } });
  return NextResponse.json({ conversation }, { status: 201 });
}
