import { z } from 'zod';
export const conversationSchema = z.object({
  title: z.string().max(120).optional(),
  revision: z.number().int().min(0).optional(),
  messages: z.array(z.object({
    id: z.string().max(200), role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(100000), timestamp: z.string().datetime(),
    metadata: z.record(z.unknown()).optional(),
  })).max(500),
});
