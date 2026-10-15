import crypto from 'crypto';

/**
 * AES-256-CBC as telecom portals hand it out (Vi CPaaS "OBD encryption key &
 * IV"): a 32-byte key and a 16-byte IV, each typed as plain text, hex or
 * base64, and the cipher text sent as base64 (PKCS#7 padding).
 */
export class AesConfigError extends Error {}

/** Reads a key/IV of exactly `bytes` bytes, whichever way it was written. */
export const parseAesBytes = (value: string, bytes: number, what = 'key'): Buffer => {
  const s = (value || '').trim();
  if (!s) throw new AesConfigError(`The encryption ${what} is empty.`);
  if (Buffer.byteLength(s, 'utf8') === bytes) return Buffer.from(s, 'utf8');
  if (s.length === bytes * 2 && /^[0-9a-f]+$/i.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/=_-]+$/.test(s)) {
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length === bytes) return b;
  }
  throw new AesConfigError(
    `The encryption ${what} must be ${bytes} characters, ${bytes * 2} hex digits or base64 of ${bytes} bytes (it is ${s.length} characters).`
  );
};

export const aesEncrypt = (plain: string, key: string, iv: string): string => {
  const cipher = crypto.createCipheriv('aes-256-cbc', parseAesBytes(key, 32), parseAesBytes(iv, 16, 'IV'));
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64');
};

export const aesDecrypt = (encoded: string, key: string, iv: string): string => {
  const s = encoded.trim();
  const data = /^[0-9a-f]+$/i.test(s) && s.length % 32 === 0 ? Buffer.from(s, 'hex') : Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', parseAesBytes(key, 32), parseAesBytes(iv, 16, 'IV'));
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

// Secrets saved in the database (provider API passwords, AES keys) are kept
// encrypted with a key derived from the server's own secret, so a database
// dump alone does not reveal them.
const serverKey = () =>
  crypto.createHash('sha256').update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'crm-settings').digest();

export const sealSecret = (plain: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', serverKey(), iv);
  return `v1:${iv.toString('base64')}:${Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')}`;
};

export const openSecret = (sealed: string | null | undefined): string => {
  if (!sealed) return '';
  const [v, iv, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !data) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', serverKey(), Buffer.from(iv, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return ''; // the server secret changed: the admin re-enters it
  }
};
