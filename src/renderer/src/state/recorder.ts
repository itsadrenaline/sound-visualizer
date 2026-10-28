/**
 * Recording the 3D view as a video, to send to a client: the show as it runs,
 * without the panels, buttons or the move arrows. MP4 where the system can make
 * it (it plays everywhere), WebM otherwise.
 */
import { create } from 'zustand'
import { view } from './viewBus'
import { notify } from './notices'
import { useStore } from './store'
import { usePrefs } from './prefs'

/** Long recordings take a lot of memory: stop on our own after this long. */
const MAX_SECONDS = 10 * 60

interface RecorderState {
  recording: boolean
  /** When it started (performance.now()), for the timer. */
  startedAt: number
  start(): void
  stop(): void
  toggle(): void
}

// H.264 MP4 first: it plays on any Mac, phone or PC. A plain "video/mp4" can mean VP9
// inside, which QuickTime won't play, so it isn't asked for.
const FORMATS: Array<[string, string]> = [
  ['video/mp4;codecs=avc1.640028', 'mp4'],
  ['video/mp4;codecs=avc1.4d0028', 'mp4'],
  ['video/mp4;codecs=avc1', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm']
]

/** The best video format this system can record, or null if it can't record at all. */
export function videoFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const found = FORMATS.find(([mime]) => MediaRecorder.isTypeSupported(mime))
  return found ? { mime: found[0], ext: found[1] } : null
}

let recorder: MediaRecorder | null = null
let chunks: Blob[] = []
let limit: number | null = null

async function save(blob: Blob, ext: string): Promise<void> {
  const name = `${useStore.getState().project.name || 'Show'}.${ext}`
  const filters = [{ name: ext === 'mp4' ? 'MP4 video' : 'WebM video', extensions: [ext] }]
  if (!window.api) {
    // In a plain browser: download it.
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    return
  }
  const path = await window.api.saveFile(name, filters, new Uint8Array(await blob.arrayBuffer()))
  if (path) notify('info', `Saved ${path.split('/').pop()}`)
}

export const useRecorder = create<RecorderState>((set, get) => ({
  recording: false,
  startedAt: 0,
  start: () => {
    if (get().recording) return
    const canvas = view.canvas()
    const format = videoFormat()
    if (!canvas || !format) return notify('error', 'Video recording isn’t available on this system.')
    const stream = canvas.captureStream(30)
    chunks = []
    try {
      recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 12_000_000 })
    } catch {
      return notify('error', 'Video recording isn’t available on this system.')
    }
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: format.mime.split(';')[0] })
      chunks = []
      if (blob.size) void save(blob, format.ext)
    }
    recorder.start(1000)
    view.setRecording(true)
    limit = window.setTimeout(() => {
      notify('info', 'Recording stopped at 10 minutes.')
      get().stop()
    }, MAX_SECONDS * 1000)
    set({ recording: true, startedAt: performance.now() })
  },
  stop: () => {
    if (limit !== null) clearTimeout(limit)
    limit = null
    view.setRecording(false)
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder = null
    set({ recording: false })
  },
  toggle: () => (get().recording ? get().stop() : get().start())
}))

// The Plan isn't the 3D view: switching to it ends the recording (and saves it).
usePrefs.subscribe((s, prev) => {
  if (s.view === 'plan' && prev.view !== 'plan' && useRecorder.getState().recording) {
    notify('info', 'Recording stopped: the video is of the 3D view.')
    useRecorder.getState().stop()
  }
})
