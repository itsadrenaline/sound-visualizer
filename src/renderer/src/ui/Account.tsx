/**
 * The web version's account: "Sign in" in the toolbar, then your picture with a menu
 * (My shows, save to your account, sign out), and the My shows window.
 */
import { useEffect, useRef, useState } from 'react'
import { MenuItem, MenuShell } from './Menu'
import {
  deleteFromAccount,
  finishSignIn,
  listShows,
  loadGoogle,
  openFromAccount,
  renameInAccount,
  saveToAccount,
  signIn,
  signOut,
  useAccount,
  type CloudShow
} from '../state/account'
import { useStore } from '../state/store'
import { useDocument } from '../state/document'

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Avatar({ name, picture }: { name: string; picture: string | null }) {
  const [broken, setBroken] = useState(false)
  if (picture && !broken) return <img className="avatar" src={picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  return (
    <span className="avatar" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** In the toolbar: Sign in, or your picture and the account menu. */
export function AccountButton() {
  const { status, user, linkedId, saving, savedAt, setShowsOpen } = useAccount()
  const edited = useDocument((s) => s.saved) !== useStore((s) => s.project)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  if (status === 'checking' || status === 'unavailable') return null
  if (status === 'signed-out' || !user) {
    return (
      <button className="account-signin" onClick={signIn} title="Sign in with Google to keep your shows and settings online">
        <GoogleMark /> Sign in
      </button>
    )
  }
  const close = () => setAt(null)
  const state = linkedId ? (saving ? 'Saving…' : edited ? 'Not saved yet' : `Saved ${ago(savedAt)}`) : null
  return (
    <>
      <button
        className={`account-button${at ? ' on' : ''}`}
        onClick={(e) => {
          if (at) return close()
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: Math.max(8, r.right - 280), y: r.bottom + 4 })
        }}
        title={`${user.name} (${user.email})${state ? `\nThis show: ${state.toLowerCase()} to your account` : ''}`}
        aria-label="Your account"
      >
        <Avatar name={user.name} picture={user.picture} />
        {linkedId && <span className={`account-dot${saving || edited ? ' busy' : ''}`} aria-hidden />}
      </button>
      {at && (
        <MenuShell at={at} onClose={close}>
          <div className="menu-title account-who">
            <b>{user.name}</b>
            <span>{user.email}</span>
          </div>
          {state && <div className="menu-title account-state">This show is in your account · {state}</div>}
          <hr />
          <MenuItem
            label="My shows…"
            onClick={() => {
              close()
              setShowsOpen(true)
            }}
          />
          <MenuItem
            label={linkedId ? 'Save now (⌘S)' : 'Save this show to my account'}
            disabled={saving}
            onClick={() => {
              close()
              void saveToAccount()
            }}
          />
          {linkedId && (
            <MenuItem
              label="Save a copy to my account"
              onClick={() => {
                close()
                void saveToAccount(true)
              }}
            />
          )}
          <hr />
          <MenuItem
            label="Sign out"
            onClick={() => {
              close()
              void signOut()
            }}
          />
        </MenuShell>
      )}
    </>
  )
}

/** Your shows in the account: open, rename, delete, or save the open one. */
export function MyShows() {
  const open = useAccount((s) => s.showsOpen)
  const setOpen = useAccount((s) => s.setShowsOpen)
  const linkedId = useAccount((s) => s.linkedId)
  const saving = useAccount((s) => s.saving)
  const projectName = useStore((s) => s.project.name)
  const [shows, setShows] = useState<CloudShow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const refresh = () => {
    setError(null)
    listShows()
      .then(setShows)
      .catch((e: Error) => setError(e.message))
  }
  useEffect(() => {
    if (!open) return
    setShows(null)
    setConfirmDelete(null)
    setRenaming(null)
    refresh()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null

  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="wizard small-dialog my-shows" role="dialog" aria-label="My shows">
        <h2>My shows</h2>
        <p className="soft">Shows kept in your account open on any computer you sign in on. A show you open from here saves itself as you work.</p>
        <div className="my-shows-save">
          <span>
            Open now: <b>{projectName}</b>
            {linkedId ? ' (in your account)' : ''}
          </span>
          <button
            className="primary"
            disabled={saving}
            onClick={() =>
              void saveToAccount(false).then((ok) => {
                if (ok) refresh()
              })
            }
          >
            {saving ? 'Saving…' : linkedId ? 'Save now' : 'Save to my account'}
          </button>
        </div>
        {error && <p className="my-shows-error">{error}</p>}
        {!shows && !error && <p className="soft">Loading your shows…</p>}
        {shows && !shows.length && <p className="soft">No shows in your account yet. Save the open show to start.</p>}
        {shows && shows.length > 0 && (
          <ul className="my-shows-list">
            {shows.map((s) => (
              <li key={s.id} className={s.id === linkedId ? 'current' : ''}>
                {renaming?.id === s.id ? (
                  <form
                    className="my-shows-rename"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const name = renaming.name.trim()
                      if (!name) return
                      void renameInAccount(s.id, name)
                        .then(() => {
                          setRenaming(null)
                          refresh()
                        })
                        .catch((err: Error) => setError(err.message))
                    }}
                  >
                    <input autoFocus aria-label="Show name" value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} />
                    <button type="submit" className="primary">
                      Rename
                    </button>
                    <button type="button" className="quiet" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="my-shows-name">
                      <b>{s.name}</b>
                      <span>
                        {s.id === linkedId ? 'Open now · ' : ''}
                        {ago(s.updated_at)} · {size(s.size)}
                      </span>
                    </div>
                    {confirmDelete === s.id ? (
                      <>
                        <span className="soft">Delete for good?</span>
                        <button
                          className="caution"
                          onClick={() =>
                            void deleteFromAccount(s.id)
                              .then(refresh)
                              .catch((err: Error) => setError(err.message))
                          }
                        >
                          Delete
                        </button>
                        <button className="quiet" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => void openFromAccount(s.id)} disabled={s.id === linkedId}>
                          Open
                        </button>
                        <button className="quiet" onClick={() => setRenaming({ id: s.id, name: s.name })}>
                          Rename
                        </button>
                        <button className="quiet" onClick={() => setConfirmDelete(s.id)} aria-label={`Delete ${s.name}`}>
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="wizard-foot">
          <span className="soft">Videos on screens stay in this browser and aren't saved to your account.</span>
          <span className="spacer" />
          <button onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** Sign in: Google's own button (it opens Google's window; no password is kept here). */
export function SignIn() {
  const open = useAccount((s) => s.signInOpen)
  const setOpen = useAccount((s) => s.setSignInOpen)
  const clientId = useAccount((s) => s.googleClientId)
  const slot = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    if (clientId) {
      loadGoogle()
        .then((id) => {
          id.initialize({
            client_id: clientId,
            // Google's own pop-up: works in every browser (the newer FedCM prompt doesn't everywhere yet).
            use_fedcm_for_button: false,
            callback: ({ credential }) => {
              setBusy(true)
              finishSignIn(credential).catch((e: Error) => {
                setBusy(false)
                setError(e.message)
              })
            }
          })
          if (slot.current) id.renderButton(slot.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 280 })
        })
        .catch((e: Error) => setError(e.message))
    }
    return () => window.removeEventListener('keydown', onKey)
  }, [open, clientId])
  if (!open) return null
  return (
    <div className="wizard-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="wizard small-dialog sign-in" role="dialog" aria-label="Sign in">
        <h2>Sign in to keep your shows</h2>
        <p>Sign in with your Google account. Your shows and settings are kept online, so they open on any computer you sign in on.</p>
        <p className="soft">There's no password to make: Google confirms it's you. This site only gets your name, email and picture.</p>
        {clientId ? (
          <div className="sign-in-google">
            <div ref={slot} />
            {busy && <span className="soft">Signing you in…</span>}
          </div>
        ) : (
          <p className="my-shows-error">Google sign-in isn't set up on this site yet.</p>
        )}
        {error && <p className="my-shows-error">{error}</p>}
        <div className="wizard-foot">
          <span className="spacer" />
          <button onClick={() => setOpen(false)}>Not now</button>
        </div>
      </div>
    </div>
  )
}
