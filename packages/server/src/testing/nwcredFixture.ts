import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

// Builds a .nwcred the way TokensExport.cs does, with few iterations so tests stay fast.
export function makeNwcred(
  values: Readonly<Record<string, string>>,
  password: string,
  iterations = 1000,
): string {
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const data = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  return JSON.stringify({
    Format: 'noisworkday-tokens',
    Version: 1,
    Iterations: iterations,
    Salt: salt.toString('base64'),
    Nonce: nonce.toString('base64'),
    Tag: cipher.getAuthTag().toString('base64'),
    Data: data.toString('base64'),
  })
}
