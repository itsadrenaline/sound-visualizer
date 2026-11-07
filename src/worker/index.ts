/**
 * The web version on Cloudflare: the page (out/web, served as static assets) plus a
 * small API for accounts. Sign in with Google (no passwords to keep), and each person's
 * settings and shows are kept in a D1 database.
 *
 *   POST /auth/google            sign in with the ID token Google's button gives the page ({ credential })
 *   POST /auth/google/redirect   the same, from Google's full-page sign-in (a form post from Google)
 *   POST /auth/logout            sign out
 *   GET  /api/config             what the page needs to show the Google button (the client ID)
 *   GET  /api/me                 who's signed in, and their saved settings
 *   PUT  /api/profile            save settings ({ prefs })
 *   GET  /api/shows              their shows (names and dates, no contents)
 *   POST /api/shows              save a new show ({ name, data })
 *   GET  /api/shows/:id          one show, with its contents
 *   PUT  /api/shows/:id          save over it ({ name?, data? })
 *   DELETE /api/shows/:id        delete it
 *
 * Settings (vars in wrangler.jsonc): GOOGLE_CLIENT_ID, the OAuth client's ID (public, no
 * secret needed: Google signs the token and the Worker checks the signature), and
 * ALLOWED_EMAILS (comma-separated; empty lets any Google account in).
 */

import { verifyGoogleToken } from './googleToken'

interface Env {
  ASSETS: Fetcher
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  ALLOWED_EMAILS?: string
  /** Local testing only (.dev.vars): /auth/dev?email= signs in without Google. Never set in production. */
  DEV_LOGIN?: string
}

interface User {
  id: string
  email: string
  name: string
  picture: string | null
}

const SESSION_COOKIE = 'sv_session'
const SESSION_DAYS = 30
/** A show's contents, as sent (uncompressed JSON). */
const MAX_SHOW_BYTES = 25 * 1024 * 1024
/** What D1 can keep in one row, after compression, with room to spare. */
const MAX_STORED_BYTES = 1_900_000
const MAX_PREFS_BYTES = 64 * 1024
const MAX_SHOWS = 200

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/auth/')) return await auth(request, env, url)
      if (url.pathname.startsWith('/api/')) return await api(request, env, url)
      return env.ASSETS.fetch(request)
    } catch (error) {
      console.error(error)
      return json({ error: 'Something went wrong on the server. Please try again.' }, 500)
    }
  }
} satisfies ExportedHandler<Env>

// --- Sign-in ----------------------------------------------------------------------------

async function auth(request: Request, env: Env, url: URL): Promise<Response> {
  // Google's "Sign in with Google" button hands the page a signed ID token; the page sends it here.
  if (url.pathname === '/auth/google' && request.method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in isn\u2019t set up on this site yet.' }, 503)
    if (!sameOrigin(request, url)) return json({ error: 'Not allowed.' }, 403)
    const { credential } = (await request.json().catch(() => ({}))) as { credential?: string }
    const claims = credential ? await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID) : null
    if (!claims) return json({ error: 'That sign-in couldn\u2019t be checked. Please try again.' }, 401)
    const email = String(claims.email).toLowerCase()
    if (!allowed(env, email)) return json({ error: `${email} isn\u2019t on the list for this test yet. Ask to be added.` }, 403)
    await ensureSchema(env.DB)
    const user = await upsertUser(env.DB, String(claims.sub), email, String(claims.name ?? email.split('@')[0]), claims.picture ? String(claims.picture) : null)
    const token = await createSession(env.DB, user.id)
    return json({ user }, 200, [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)])
  }

  // Google's full-page sign-in (no pop-up, so it works in every browser): Google posts the
  // signed token back here as a form. Its CSRF token must match the cookie Google's script set.
  if (url.pathname === '/auth/google/redirect' && request.method === 'POST') {
    const back = (code: string) => redirect(`/?signin=${code}`)
    if (!env.GOOGLE_CLIENT_ID) return back('unavailable')
    const form = await request.formData().catch(() => null)
    const csrf = form?.get('g_csrf_token')
    const credential = form?.get('credential')
    if (typeof csrf !== 'string' || !csrf || csrf !== readCookie(request, 'g_csrf_token')) return back('expired')
    const claims = typeof credential === 'string' ? await verifyGoogleToken(credential, env.GOOGLE_CLIENT_ID) : null
    if (!claims) return back('failed')
    const email = String(claims.email).toLowerCase()
    if (!allowed(env, email)) return back('not-allowed')
    await ensureSchema(env.DB)
    const user = await upsertUser(env.DB, String(claims.sub), email, String(claims.name ?? email.split('@')[0]), claims.picture ? String(claims.picture) : null)
    const token = await createSession(env.DB, user.id)
    return redirect('/', [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)])
  }

  if (url.pathname === '/auth/dev' && env.DEV_LOGIN === '1' && isLocal(url)) {
    await ensureSchema(env.DB)
    const email = (url.searchParams.get('email') ?? 'tester@example.com').toLowerCase()
    const user = await upsertUser(env.DB, `dev:${email}`, email, email.split('@')[0], null)
    const token = await createSession(env.DB, user.id)
    return redirect('/', [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)])
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    if (!sameOrigin(request, url)) return json({ error: 'Not allowed.' }, 403)
    const token = readCookie(request, SESSION_COOKIE)
    if (token) {
      await ensureSchema(env.DB)
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
    }
    return json({ ok: true }, 200, [cookie(SESSION_COOKIE, '', 0)])
  }

  return json({ error: 'Not found.' }, 404)
}

// --- API --------------------------------------------------------------------------------

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  await ensureSchema(env.DB)
  const user = await currentUser(request, env.DB)
  const method = request.method

  if (url.pathname === '/api/config' && method === 'GET') {
    return json({ googleClientId: env.GOOGLE_CLIENT_ID || null })
  }

  if (url.pathname === '/api/me' && method === 'GET') {
    if (!user) return json({ user: null })
    const row = await env.DB.prepare('SELECT prefs FROM users WHERE id = ?').bind(user.id).first<{ prefs: string | null }>()
    return json({ user, prefs: row?.prefs ? JSON.parse(row.prefs) : null })
  }

  if (!user) return json({ error: 'Please sign in first.' }, 401)
  if (method !== 'GET' && !sameOrigin(request, url)) return json({ error: 'Not allowed.' }, 403)

  if (url.pathname === '/api/profile' && method === 'PUT') {
    const text = await request.text()
    if (text.length > MAX_PREFS_BYTES) return json({ error: 'Those settings are too large.' }, 413)
    const body = JSON.parse(text) as { prefs?: unknown }
    await env.DB.prepare('UPDATE users SET prefs = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(body.prefs ?? null), now(), user.id).run()
    return json({ ok: true })
  }

  if (url.pathname === '/api/shows' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, name, size, created_at, updated_at FROM shows WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all()
    return json({ shows: results })
  }

  if (url.pathname === '/api/shows' && method === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM shows WHERE user_id = ?').bind(user.id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_SHOWS) return json({ error: `You can keep up to ${MAX_SHOWS} shows. Delete one to save another.` }, 409)
    const body = await readShowBody(request)
    if ('error' in body) return json({ error: body.error }, body.status)
    if (body.data === undefined) return json({ error: 'The show is missing.' }, 400)
    const id = crypto.randomUUID()
    const stamp = now()
    await env.DB.prepare('INSERT INTO shows (id, user_id, name, data, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, body.name ?? 'Untitled show', body.data, body.size, stamp, stamp)
      .run()
    return json({ id, name: body.name ?? 'Untitled show', updated_at: stamp }, 201)
  }

  const match = /^\/api\/shows\/([0-9a-f-]{36})$/.exec(url.pathname)
  if (match) {
    const id = match[1]
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT id, name, data, updated_at FROM shows WHERE id = ? AND user_id = ?').bind(id, user.id).first<{ id: string; name: string; data: ArrayBuffer; updated_at: string }>()
      if (!row) return json({ error: 'That show isn’t in your account.' }, 404)
      const text = await gunzip(new Uint8Array(row.data))
      return new Response(`{"id":${JSON.stringify(row.id)},"name":${JSON.stringify(row.name)},"updated_at":${JSON.stringify(row.updated_at)},"data":${text}}`, {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      })
    }
    if (method === 'PUT') {
      const body = await readShowBody(request)
      if ('error' in body) return json({ error: body.error }, body.status)
      const stamp = now()
      const sets = ['updated_at = ?']
      const values: unknown[] = [stamp]
      if (body.name !== undefined) (sets.push('name = ?'), values.push(body.name))
      if (body.data !== undefined) (sets.push('data = ?', 'size = ?'), values.push(body.data, body.size))
      const result = await env.DB.prepare(`UPDATE shows SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values, id, user.id).run()
      if (!result.meta.changes) return json({ error: 'That show isn’t in your account.' }, 404)
      return json({ id, updated_at: stamp })
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM shows WHERE id = ? AND user_id = ?').bind(id, user.id).run()
      return json({ ok: true })
    }
  }

  return json({ error: 'Not found.' }, 404)
}

/** A show from the request: its name, and its contents compressed for storage. */
async function readShowBody(request: Request): Promise<{ name?: string; data?: Uint8Array; size: number } | { error: string; status: number }> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_SHOW_BYTES) return { error: 'That show is too large to keep in your account.', status: 413 }
  const text = await request.text()
  if (text.length > MAX_SHOW_BYTES) return { error: 'That show is too large to keep in your account.', status: 413 }
  let body: { name?: unknown; data?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return { error: 'That isn’t a show.', status: 400 }
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) || 'Untitled show' : undefined
  if (body.data === undefined) return { name, size: 0 }
  const raw = JSON.stringify(body.data)
  const data = await gzip(raw)
  if (data.byteLength > MAX_STORED_BYTES) return { error: 'That show is too large to keep in your account (videos and big images make shows large).', status: 413 }
  return { name, data, size: raw.length }
}

// --- Database ---------------------------------------------------------------------------

let schemaReady: Promise<void> | null = null

/** The tables, made the first time the Worker runs (so a new database needs no setup step). */
function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT NOT NULL,
        picture TEXT, prefs TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`),
      db.prepare('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS shows (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare('CREATE INDEX IF NOT EXISTS shows_user ON shows(user_id, updated_at)')
    ])
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null
      throw error
    })
  return schemaReady
}

async function upsertUser(db: D1Database, sub: string, email: string, name: string, picture: string | null): Promise<User> {
  const stamp = now()
  const existing = await db.prepare('SELECT id FROM users WHERE google_sub = ?').bind(sub).first<{ id: string }>()
  const id = existing?.id ?? crypto.randomUUID()
  if (existing) {
    await db.prepare('UPDATE users SET email = ?, name = ?, picture = ?, updated_at = ?, last_login_at = ? WHERE id = ?').bind(email, name, picture, stamp, stamp, id).run()
  } else {
    await db.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, sub, email, name, picture, stamp, stamp, stamp).run()
  }
  return { id, email, name, picture }
}

/** A new session; the cookie holds the token, the database only its hash. */
async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken(32)
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now(), expires)
  ])
  return token
}

async function currentUser(request: Request, db: D1Database): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  return db
    .prepare('SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?')
    .bind(await sha256(token), now())
    .first<User>()
}

// --- Helpers ----------------------------------------------------------------------------

function allowed(env: Env, email: string): boolean {
  const list = (env.ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return !list.length || list.includes(email)
}

const now = () => new Date().toISOString()
const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1'

/** Only state changes from this site's own pages. */
function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin')
  return origin === url.origin
}

function randomToken(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(data: Uint8Array): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || null
  }
  return null
}

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status: 302, headers })
}

