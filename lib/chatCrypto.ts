/**
 * Client-side encryption for chat messages (E2E-style).
 * Key is derived from conversation salt + id so both participants can decrypt.
 * Uses AES-GCM. Encrypted content is stored as "e2e:" + base64(iv + ciphertext).
 */

const ALGO = 'AES-GCM'
const KEY_LEN = 256
const IV_LEN = 12
export const SALT_LEN = 16

export async function deriveKey(conversationId: string, saltBase64: string): Promise<CryptoKey> {
  const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(conversationId),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv, tagLength: 128 },
    key,
    encoded
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode.apply(null, Array.from(combined)))
}

export async function decrypt(ciphertextBase64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LEN)
  const ciphertext = combined.slice(IV_LEN)
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv, tagLength: 128 },
    key,
    ciphertext
  )
  return new TextDecoder().decode(decrypted)
}

const E2E_PREFIX = 'e2e:'

export function isEncrypted(content: string): boolean {
  return content.startsWith(E2E_PREFIX)
}

export function stripE2EPrefix(content: string): string {
  return content.startsWith(E2E_PREFIX) ? content.slice(E2E_PREFIX.length) : content
}

export function withE2EPrefix(encryptedBase64: string): string {
  return E2E_PREFIX + encryptedBase64
}
