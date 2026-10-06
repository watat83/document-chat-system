const connections = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();
const encoder = new TextEncoder();

export function registerNotificationConnection(userId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  const active = connections.get(userId) ?? new Set();
  active.add(controller);
  connections.set(userId, active);
  return () => {
    active.delete(controller);
    if (!active.size) connections.delete(userId);
  };
}

function send(userId: string, event: string, payload: unknown): boolean {
  const active = connections.get(userId);
  if (!active) return false;
  let sent = false;
  for (const controller of active) {
    try {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      sent = true;
    } catch {
      active.delete(controller);
    }
  }
  if (!active.size) connections.delete(userId);
  return sent;
}

export function sendNotificationToUser(userId: string, notification: unknown) {
  return send(userId, 'notification', { type: 'notification', notification, timestamp: new Date().toISOString() });
}

export async function sendNotificationToOrganization(organizationId: string, notification: unknown) {
  const { db } = await import('@/lib/db');
  const users = await db.user.findMany({ where: { organizationId }, select: { clerkId: true } });
  return users.reduce((count, user) => count + Number(sendNotificationToUser(user.clerkId, notification)), 0);
}

export function broadcastSystemNotification(notification: unknown) {
  let sent = 0;
  for (const userId of connections.keys()) {
    sent += Number(send(userId, 'system', { type: 'system', notification, timestamp: new Date().toISOString() }));
  }
  return sent;
}
