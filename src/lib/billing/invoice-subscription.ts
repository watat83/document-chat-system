/** Supports Basil's parent shape and signed events emitted by older API versions. */
export function getInvoiceSubscriptionId(invoice: {
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  subscription?: string | { id: string } | null;
}): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id ?? null;
}
