/** Pure access rules shared by routes and regression tests. */
export interface AccessUser { id: string; organizationId: string; role?: string }
export interface AccessDocument {
  organizationId: string; uploadedById: string; deletedAt?: Date | string | null;
  sharing?: unknown;
}
export function isPlatformAdminId(userId: string, allowlist = ''): boolean {
  return allowlist.split(',').map(id => id.trim()).filter(Boolean).includes(userId);
}
export function canAccessOrganization(user: AccessUser | null, organizationId: string): boolean {
  return !!user && user.organizationId === organizationId;
}
export function canAccessDocument(user: AccessUser, document: AccessDocument, operation: 'READ' | 'WRITE' | 'DELETE' | 'SHARE' = 'READ'): boolean {
  if (document.deletedAt || !canAccessOrganization(user, document.organizationId)) return false;
  if (document.uploadedById === user.id || user.role === 'OWNER' || user.role === 'ADMIN') return true;
  // Existing documents are readable within their organization; mutations require a grant.
  if (operation === 'READ') return true;
  const sharing = document.sharing as { permissions?: { userId: string; permission: string; expiresAt?: string }[] } | null;
  return sharing?.permissions?.some(grant => grant.userId === user.id &&
    grant.permission === operation && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now())) ?? false;
}
