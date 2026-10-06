import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

/** Opportunity synchronization has no registered worker in the document workspace. */
async function unavailableSync() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
  return NextResponse.json({ success: false, code: 'INTEGRATION_UNAVAILABLE', error: 'SAM.gov opportunity synchronization is not configured in this document workspace' }, { status: 503 });
}
export const POST = unavailableSync;
export const GET = unavailableSync;
