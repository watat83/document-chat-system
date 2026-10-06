interface SubscriptionPeriodSource {
  items?: { data: Array<{ current_period_start?: number; current_period_end?: number }> };
  current_period_start?: number;
  current_period_end?: number;
}

/** This application bills one plan item; older signed events carry periods on the subscription. */
export function getSubscriptionPeriod(subscription: SubscriptionPeriodSource) {
  const item = subscription.items?.data[0];
  const start = item?.current_period_start ?? subscription.current_period_start;
  const end = item?.current_period_end ?? subscription.current_period_end;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Subscription does not contain a valid billing period');
  }
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}
