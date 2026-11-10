// AES-256-GCM sealing for cookies (spec §8.1). Key = SESSION_SECRET (32 random bytes, base64).

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(bytes = 24): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    const raw = Uint8Array.from(atob(secret.trim()), (c) => c.charCodeAt(0));
    if (raw.length !== 32) throw new Error('SESSION_SECRET must be 32 bytes (base64)');
    k = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    keyCache.set(secret, k);
  }
  return k;
}

/** Encrypts a JSON value. Output: base64url(iv[12] || ciphertext+tag). `purpose` is bound as AAD. */
export async function seal(secret: string, purpose: string, value: unknown): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(purpose) }, key, data),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64urlEncode(out);
}

/** Decrypts; returns null on any tampering, wrong key, or wrong purpose. */
export async function open<T>(secret: string, purpose: string, sealed: string): Promise<T | null> {
  try {
    const key = await importKey(secret);
    const bytes = b64urlDecode(sealed);
    if (bytes.length < 13 + 16) return null;
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode(purpose) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    return null;
  }
}
