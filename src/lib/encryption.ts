/**
 * Encryption utilities for settings and sensitive data
 *
 * Uses browser-safe encryption for client-side data storage
 */

import crypto from 'crypto';

// Encryption key - in production this should come from environment variables
function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error('ENCRYPTION_KEY must contain at least 32 characters');
  return key;
}
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt a string value
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.createHash('sha256').update(encryptionKey()).digest();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Unable to encrypt settings');
  }
}

/**
 * Decrypt a string value
 */
export function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      return text; // Not encrypted, return as-is
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = crypto.createHash('sha256').update(encryptionKey()).digest();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Unable to decrypt settings');
  }
}

/**
 * Encrypt an entire settings object
 */
export function encryptSettings<T extends Record<string, any>>(settings: T, fields?: readonly string[]): T {
  const encrypted = {} as T;

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && value && (!fields || fields.includes(key))) {
      // Only encrypt non-empty strings
      encrypted[key as keyof T] = encrypt(value) as any;
    } else {
      encrypted[key as keyof T] = value;
    }
  }

  return encrypted;
}

/**
 * Decrypt an entire settings object
 */
export function decryptSettings<T extends Record<string, any>>(settings: T, fields?: readonly string[]): T {
  const decrypted = {} as T;

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && value && (!fields || fields.includes(key))) {
      // Only decrypt non-empty strings
      decrypted[key as keyof T] = decrypt(value) as any;
    } else {
      decrypted[key as keyof T] = value;
    }
  }

  return decrypted;
}

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '••••••••';
  }

  const firstFour = apiKey.substring(0, 4);
  const lastFour = apiKey.substring(apiKey.length - 4);
  const masked = '•'.repeat(Math.min(apiKey.length - 8, 20));

  return `${firstFour}${masked}${lastFour}`;
}

/**
 * Validate if a string is encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  return parts.length === 2 && /^[0-9a-f]+$/.test(parts[0]) && /^[0-9a-f]+$/.test(parts[1]);
}
