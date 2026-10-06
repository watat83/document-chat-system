import { isPlatformAdminId } from './access-policy';
/** Platform access is independent of an organization's OWNER/ADMIN role. */
export function isPlatformAdmin(userId: string): boolean {
  return isPlatformAdminId(userId, process.env.PLATFORM_ADMIN_CLERK_IDS);
}
