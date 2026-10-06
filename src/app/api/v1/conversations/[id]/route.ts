import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { conversationSchema } from '@/lib/chat/conversation-schema';
type Context = { params: Promise<{ id: string }> };
async function owner(context: Context) {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: (await context.params).id, organizationId: user.organizationId, userId: user.id };
}
export async function GET(_request: NextRequest, context: Context) {
  const where = await owner(context);
  if (!where) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const conversation = await prisma.conversation.findFirst({ where });
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function PUT(request: NextRequest, context: Context) {
  const where = await owner(context);
  if (!where) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = conversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.revision === undefined) return NextResponse.json({ error: 'Invalid conversation or missing revision' }, { status: 400 });
  const { messages, title, revision } = parsed.data;
  const result = await prisma.conversation.updateMany({ where: { ...where, revision }, data: { messages: messages as any, ...(title ? { title } : {}), revision: { increment: 1 } } });
  if (result.count !== 1) return NextResponse.json({ error: 'Conversation changed in another tab. Reload before saving.' }, { status: 409 });
  return NextResponse.json({ conversation: await prisma.conversation.findFirst({ where }) });
}
export async function DELETE(_request: NextRequest, context: Context) {
  const where = await owner(context);
  if (!where) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.conversation.deleteMany({ where });
  return NextResponse.json({ success: true });
}
