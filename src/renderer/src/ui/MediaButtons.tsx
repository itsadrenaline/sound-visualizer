/**
 * Picture and video buttons for the view toolbars: a camera saves a PNG, a video
 * camera records the 3D view as it runs (click again to stop and save).
 */
import { useEffect, useState } from 'react'
import { useRecorder, videoFormat } from '../state/recorder'

export function CameraIcon() {
  return (
    <svg className="tb-icon" viewBox="0 0 20 20" width="17" height="17" aria-hidden>
      <path d="M3 6.5h3l1.4-2h5.2l1.4 2h3v9H3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="10.8" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function VideoIcon() {
  return (
    <svg className="tb-icon" viewBox="0 0 20 20" width="17" height="17" aria-hidden>
      <rect x="2.5" y="5.5" width="10.5" height="9" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 9l4.5-2.6v7.2L13 11z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function PictureButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button className="icon-btn" data-tour="image" onClick={onClick} title={title} aria-label={title}>
      <CameraIcon />
    </button>
  )
}

export function RecordButton() {
  const { recording, startedAt, toggle } = useRecorder()
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!recording) return
    const t = window.setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(t)
  }, [recording])
  if (!videoFormat()) return null
  if (recording) {
    return (
      <button className="icon-btn recording" onClick={toggle} title="Stop recording and save the video (Shift+Cmd+R)" aria-label="Stop recording">
        <span className="rec-dot" aria-hidden />
        {clock(now - startedAt)}
        <span className="rec-stop" aria-hidden />
      </button>
    )
  }
  return (
    <button className="icon-btn" data-tour="video" onClick={toggle} title="Record a video of the 3D view as the show runs, to send to a client. Click again to stop and save (Shift+Cmd+R)" aria-label="Record a video">
      <VideoIcon />
    </button>
  )
}
