/**
 * Checking the ID token Google's "Sign in with Google" button gives the page: signed by
 * Google (its published keys), meant for this site (the client ID), current, and for a
 * verified email. Plain Web Crypto, so it runs in the Worker and in tests.
 */

interface Jwk extends JsonWebKey {
  kid: string
}

let googleKeys: { keys: Jwk[]; until: number } | null = null

/** Google's current signing keys, kept as long as Google says they're good for. */
async function googleKey(kid: string): Promise<Jwk | null> {
  if (!googleKeys || googleKeys.until < Date.now() || !googleKeys.keys.some((k) => k.kid === kid)) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs')
    if (!response.ok) return null
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600)
    googleKeys = { keys: ((await response.json()) as { keys: Jwk[] }).keys, until: Date.now() + maxAge * 1000 }
  }
  return googleKeys.keys.find((k) => k.kid === kid) ?? null
}

/** The token's claims if Google signed it, for this site, and it's current; otherwise null. */
export async function verifyGoogleToken(token: string, clientId: string): Promise<Record<string, unknown> | null> {
  const [head, body, signature] = token.split('.')
  if (!head || !body || !signature) return null
  const header = decodePart(head)
  const claims = decodePart(body)
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return null
  const jwk = await googleKey(header.kid)
  if (!jwk) return null
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytesOf(signature), new TextEncoder().encode(`${head}.${body}`))
  if (!ok) return null
  const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  const nowSeconds = Date.now() / 1000
  if (!issuerOk || claims.aud !== clientId || Number(claims.exp) < nowSeconds - 60 || Number(claims.iat ?? 0) > nowSeconds + 300) return null
  if (!claims.sub || !claims.email || claims.email_verified === false) return null
  return claims
}

function bytesOf(part: string): Uint8Array<ArrayBuffer> {
  const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytesOf(part)))
  } catch {
    return null
  }
}
