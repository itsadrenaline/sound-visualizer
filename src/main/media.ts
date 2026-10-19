/**
 * Videos shown on screens in the 3D view. They're too big to keep inside a show file,
 * so a copy is kept here, in the app's own folder (~/Library/Application Support/
 * Sound Visualizer/media), named by its content; the show stores only that name.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { userPath } from './paths'

const SAFE = /^[0-9a-f]{20}\.(mp4|m4v|mov|webm)$/

/** Keep a copy of a video; returns its id ("3f2a….mp4"). */
export function saveMedia(name: string, data: Uint8Array): string {
  const ext = (/\.(mp4|m4v|mov|webm)$/i.exec(name)?.[1] ?? 'mp4').toLowerCase()
  const id = `${createHash('sha256').update(data).digest('hex').slice(0, 20)}.${ext}`
  const file = userPath('media', id)
  if (!existsSync(file)) writeFileSync(file, data)
  return id
}

/** A kept video's bytes, or null if this computer doesn't have it. */
export function readMedia(id: string): Uint8Array | null {
  if (!SAFE.test(id)) return null
  const file = userPath('media', id)
  return existsSync(file) ? new Uint8Array(readFileSync(file)) : null
}
