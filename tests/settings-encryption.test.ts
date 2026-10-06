import { encrypt, decrypt, encryptSettings, decryptSettings } from '@/lib/encryption';
const previous = process.env.ENCRYPTION_KEY;
beforeEach(() => { process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-with-32-characters'; });
afterAll(() => { if (previous === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = previous; });
test('only explicitly sensitive settings are encrypted, with round-trip preservation', () => {
  const input = { apiKey: 'secret-value', endpoint: 'https://example.test', enabled: true };
  const encrypted = encryptSettings(input, ['apiKey']);
  expect(encrypted.apiKey).not.toBe(input.apiKey); expect(encrypted.endpoint).toBe(input.endpoint);
  expect(decryptSettings(encrypted, ['apiKey'])).toEqual(input);
});
test('encryption cannot silently store plaintext without a configured key', () => {
  delete process.env.ENCRYPTION_KEY;
  expect(() => encrypt('secret-value')).toThrow('Unable to encrypt settings');
});
test('corrupt encrypted values are errors instead of being returned as decrypted secrets', () => {
  expect(() => decrypt('abcd:abcdef')).toThrow('Unable to decrypt settings');
});
