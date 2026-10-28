/** A small padlock: closed when locked, open when not. */
import { setLocked } from '../state/commands'

export function LockIcon({ locked, size = 12 }: { locked: boolean; size?: number }) {
  return (
    <svg className="lock-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor" />
      <path d={locked ? 'M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2' : 'M5.2 7V5a2.8 2.8 0 0 1 5.4-1'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** Shown on a locked row in a list: click to unlock. */
export function LockedBadge({ id }: { id: string }) {
  return (
    <button
      className="lock-badge"
      title="Locked: it can't be moved by accident. Click to unlock."
      onClick={(e) => {
        e.stopPropagation()
        setLocked([id], false)
      }}
    >
      <LockIcon locked />
    </button>
  )
}
