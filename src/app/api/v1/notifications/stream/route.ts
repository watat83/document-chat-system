import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCurrentUser } from '@/lib/auth';
import { registerNotificationConnection } from '@/lib/notification-stream';

export async function HEAD() {
  const { userId } = await auth();
  return new Response(null, { status: userId ? 200 : 401 });
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  if (!await getCurrentUser()) return new Response('User not found', { status: 404 });

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unregister = registerNotificationConnection(userId, controller);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unregister();
        request.signal.removeEventListener('abort', close);
        try { controller.close(); } catch { /* The reader may have cancelled already. */ }
      };
      const heartbeat = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode('event: heartbeat\ndata: {}\n\n')); }
        catch { close(); }
      }, 30000);
      cleanup = close;
      request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) close();
      else controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify({ type: 'connection', timestamp: new Date().toISOString() })}\n\n`));
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
