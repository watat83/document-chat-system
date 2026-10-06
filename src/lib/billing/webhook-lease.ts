interface EventStore {
  billingEvent: {
    upsert(args: any): Promise<{ id: string; processed: boolean }>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}
export async function claimWebhook(store: EventStore, event: { id: string; type: string }, now = new Date()) {
  const record = await store.billingEvent.upsert({
    where: { stripeEventId: event.id }, update: {},
    create: { eventType: event.type, stripeEventId: event.id, data: event, processed: false },
  });
  if (record.processed) return { status: 'completed' as const, id: record.id };
  const claim = await store.billingEvent.updateMany({
    where: { id: record.id, processed: false, OR: [
      { processingStartedAt: null },
      { processingStartedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
    ] }, data: { processingStartedAt: now, processingError: null },
  });
  return { status: claim.count === 1 ? 'claimed' as const : 'busy' as const, id: record.id, startedAt: now };
}
