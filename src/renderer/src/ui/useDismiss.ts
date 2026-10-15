/**
 * Close a dropdown when you click somewhere else or press Esc, not when the mouse
 * leaves it: the Mac's colour picker is a separate window, so moving the mouse to
 * it used to count as leaving the Room menu and closed it mid-choice.
 */
import { useEffect, useRef } from 'react'

export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [open, close])
  return ref
}
