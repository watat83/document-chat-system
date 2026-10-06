import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${digest.toString('hex')}`;
}
export async function verifySharePassword(password: string, hash: string): Promise<boolean> {
  const [salt, digest] = hash.split(':');
  if (!salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
export function isShareActive(share: { isShared?: boolean; expiresAt?: string | null } | null, now = Date.now()) {
  // Legacy links without an expiry must be recreated through the secure endpoint.
  return !!share?.isShared && !!share.expiresAt && Date.parse(share.expiresAt) > now;
}
