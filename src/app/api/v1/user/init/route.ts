import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { provisionUser } from '@/lib/auth/provision-user';
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const profile = await currentUser();
    if (!profile) return NextResponse.json({ error: 'Account unavailable' }, { status: 404 });
    const user = await provisionUser(profile);
    return NextResponse.json({ success: true, data: { userId: user.id, organizationId: user.organizationId, organizationName: user.organization.name } });
  } catch (error) {
    console.error('User initialization failed', error);
    return NextResponse.json({ error: 'Failed to initialize user' }, { status: 500 });
  }
}
