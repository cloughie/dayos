import http2 from 'http2'
import { createSign } from 'crypto'

// Normalises a .p8 PEM key from an env var.
// Vercel may store multiline secrets with literal newlines OR with escaped \n;
// either way we end up with valid 64-char-wrapped PEM that OpenSSL 3 can parse.
function normalizePemKey(raw: string): string {
  // Convert escaped \n sequences to real newlines, then trim surrounding whitespace.
  const key = raw.replace(/\\n/g, '\n').trim()
  // Extract just the base64 body, stripping headers/footers and any whitespace.
  const body = key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  // Re-wrap into 64-char lines (OpenSSL 3 requires this).
  const lines = (body.match(/.{1,64}/g) ?? []).join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
}

// Generates a JWT for APNs authentication using ES256 (the .p8 key from Apple).
// The JWT is valid for ~1 hour; we regenerate per cron invocation.
function makeApnsJwt(keyId: string, teamId: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString('base64url')
  const signingInput = `${header}.${payload}`
  const sign = createSign('SHA256')
  sign.update(signingInput)
  // dsaEncoding: 'ieee-p1363' gives raw r||s bytes instead of DER — what JWT requires.
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url')
  return `${signingInput}.${sig}`
}

export type ApnsResult = 'sent' | 'expired' | 'error'

// Sends a single APNs notification over a new HTTP/2 connection.
// At our current scale (a few dozen users), one connection per send is acceptable.
// If volume grows, refactor to reuse a single connection across a batch.
export async function sendApnsNotification(
  deviceToken: string,
  title: string,
  body: string,
): Promise<ApnsResult> {
  const keyId     = process.env.APNS_KEY_ID
  const teamId    = process.env.APNS_TEAM_ID
  const bundleId  = process.env.APNS_BUNDLE_ID
  const privateKey = normalizePemKey(process.env.APNS_PRIVATE_KEY ?? '')

  if (!keyId || !teamId || !bundleId || !privateKey) {
    console.error('[APNs] Missing required env vars (APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID / APNS_PRIVATE_KEY)')
    return 'error'
  }

  // Use sandbox only when explicitly opted in (e.g. Xcode direct-to-device testing).
  // TestFlight and App Store builds use the production endpoint.
  const host = process.env.APNS_SANDBOX === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'

  let jwt: string
  try {
    jwt = makeApnsJwt(keyId, teamId, privateKey)
  } catch (err) {
    console.error('[APNs] JWT generation failed:', err)
    return 'error'
  }

  const apnsPayload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default',
    },
  })

  return new Promise<ApnsResult>((resolve) => {
    const client = http2.connect(host)

    client.on('error', (err) => {
      console.error('[APNs] Connection error:', err)
      resolve('error')
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(apnsPayload),
    })

    req.write(apnsPayload)
    req.end()

    let status = 0
    let responseBody = ''

    req.on(':response', (headers) => {
      status = headers[':status'] as number
    })
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { responseBody += chunk })
    req.on('end', () => {
      client.close()
      if (status === 200) {
        resolve('sent')
        return
      }
      let reason = ''
      try { reason = (JSON.parse(responseBody) as { reason?: string }).reason ?? '' } catch { /* ignore */ }
      // 410 = Unregistered; BadDeviceToken means the token is invalid/expired.
      const expired = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered'
      console.error(`[APNs] Send failed: status=${status} reason=${reason}`)
      resolve(expired ? 'expired' : 'error')
    })
    req.on('error', (err) => {
      client.close()
      console.error('[APNs] Request error:', err)
      resolve('error')
    })
  })
}
