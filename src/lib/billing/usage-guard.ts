import { NextResponse } from 'next/server';
import { UsageTrackingService, UsageType } from '@/lib/usage-tracking';
export async function guardUsage(organizationId: string, type: UsageType) {
  try {
    const usage = await UsageTrackingService.checkUsageLimit(organizationId, type, 1);
    if (!usage.allowed) return NextResponse.json({ error: 'Usage limit reached', remaining: usage.remainingUsage }, { status: 429 });
    return null;
  } catch (error) {
    console.error('Usage enforcement unavailable', error);
    return NextResponse.json({ error: 'Usage verification unavailable; please retry' }, { status: 503 });
  }
}
