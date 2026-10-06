import { POST as command } from '@/app/api/ai/command/route';
import { POST as copilot } from '@/app/api/ai/copilot/route';
import { getCurrentUser } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { generateText, streamText } from 'ai';
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/billing/usage-guard', () => ({ guardUsage: jest.fn() }));
jest.mock('@/lib/usage-tracking', () => ({ UsageType: { AI_QUERY: 'AI_QUERY' }, UsageTrackingService: { trackUsage: jest.fn() } }));
jest.mock('ai', () => ({ generateText: jest.fn(), streamText: jest.fn(), convertToModelMessages: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); (getCurrentUser as jest.Mock).mockResolvedValue(null); });
test.each([command, copilot])('editor AI authenticates before parsing or contacting providers', async handler => {
  const result = await handler(new NextRequest('https://example.test/api/ai', { method: 'POST', body: '{invalid' }));
  expect(result.status).toBe(401);
  expect(generateText).not.toHaveBeenCalled(); expect(streamText).not.toHaveBeenCalled();
});
