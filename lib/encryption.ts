// Server-only — never import from client components.
// AES-256-GCM encryption for user memory content.
//
// Stored format: enc:v1:{iv_hex}:{authTag_hex}:{ciphertext_hex}
//
// The prefix lets us distinguish encrypted values from legacy plain-text rows
// and version the scheme if we ever need to rotate or upgrade.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12   // 96-bit IV — recommended for GCM
const PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const hex = process.env.MEMORY_ENCRYPTION_KEY
  if (!hex) throw new Error('MEMORY_ENCRYPTION_KEY environment variable is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('MEMORY_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)')
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

/**
 * Decrypts a memory value.
 * If the value does not carry the enc:v1: prefix it is treated as legacy
 * plain text and returned unchanged — no migration required for existing rows.
 */
export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) return value   // legacy plain-text passthrough

  const parts = value.slice(PREFIX.length).split(':')
  if (parts.length !== 3) throw new Error('Malformed encrypted memory value')

  const [ivHex, tagHex, ciphertextHex] = parts
  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(ciphertextHex, 'hex')).toString('utf8') +
    decipher.final('utf8')
}
