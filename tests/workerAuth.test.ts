import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyGoogleToken } from '../src/worker/googleToken'

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)))

async function setup() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=60' } })))
  const sign = async (claims: Record<string, unknown>, kid = 'k1') => {
    const head = enc({ alg: 'RS256', kid, typ: 'JWT' })
    const body = enc(claims)
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)))
    return `${head}.${body}.${b64url(sig)}`
  }
  return { sign }
}

const now = () => Math.floor(Date.now() / 1000)
const good = () => ({ iss: 'https://accounts.google.com', aud: 'client-1', sub: '123', email: 'dj@example.com', email_verified: true, iat: now(), exp: now() + 3600 })

afterEach(() => vi.unstubAllGlobals())

describe('Google sign-in token check', () => {
  it('accepts a token Google signed for this site', async () => {
    const { sign } = await setup()
    expect((await verifyGoogleToken(await sign(good()), 'client-1'))?.email).toBe('dj@example.com')
  })
  it('refuses another site’s token, an expired one, an unverified email and a changed one', async () => {
    const { sign } = await setup()
    expect(await verifyGoogleToken(await sign(good()), 'client-2')).toBeNull()
    expect(await verifyGoogleToken(await sign({ ...good(), exp: now() - 3600 }), 'client-1')).toBeNull()
    expect(await verifyGoogleToken(await sign({ ...good(), email_verified: false }), 'client-1')).toBeNull()
    expect(await verifyGoogleToken(await sign({ ...good(), iss: 'https://evil.example' }), 'client-1')).toBeNull()
    const token = await sign(good())
    const [h, , s] = token.split('.')
    expect(await verifyGoogleToken(`${h}.${enc({ ...good(), email: 'someone@else.com' })}.${s}`, 'client-1')).toBeNull()
  })
})
