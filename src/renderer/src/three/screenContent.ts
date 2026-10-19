/**
 * What a screen, TV or LED wall shows: moving colours, visuals, a picture, a video
 * or words. One ScreenSurface per screen, laid over its face; StructureRig keeps it
 * in step with the object's settings and ticks it every frame.
 *
 * Pictures are kept in the show (a data: URL). Videos are big, so they stay on this
 * computer, in the app's media store (window.api.saveMedia / readMedia): a show opened
 * on another computer asks for the video again.
 */
import * as THREE from 'three'
import { NEON_COLOURS, type StructureParams } from '../model/structures'

const hue = (h: number, s = 1, l = 0.5) => `hsl(${((h % 1) + 1) % 1 * 360}, ${s * 100}%, ${l * 100}%)`

/** Videos by media id, loaded once and shared by every screen showing them. */
const videos = new Map<string, Promise<string | null>>()
function videoUrl(id: string): Promise<string | null> {
  let url = videos.get(id)
  if (!url) {
    url = (async () => {
      const bytes = await window.api?.readMedia(id).catch(() => null)
      if (!bytes) return null
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type: /\.(mov|qt)$/i.test(id) ? 'video/quicktime' : /\.webm$/i.test(id) ? 'video/webm' : 'video/mp4' }))
    })()
    videos.set(id, url)
  }
  return url
}

export class ScreenSurface {
  readonly mesh: THREE.Mesh
  private material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  private canvas: HTMLCanvasElement | null = null
  private video: HTMLVideoElement | null = null
  private kind: StructureParams['content'] = 'off'
  private key = ''
  private text = ''
  private tint = '#ffffff'

  /** `w` × `h` metres; `brightness` below 1 for a projection screen (projected, not lit from behind). */
  constructor(w: number, h: number, brightness = 1) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material)
    this.mesh.raycast = () => {}
    this.mesh.visible = false
    this.material.color.setScalar(brightness)
  }

  /** Show what the object's settings say (only does work when they changed). */
  set(p: StructureParams): void {
    const key = `${p.content}|${p.content === 'image' || p.content === 'video' ? p.media : ''}|${p.content === 'text' ? `${p.text}|${p.tint}` : ''}`
    if (key === this.key) return
    this.key = key
    this.clear()
    this.kind = p.content ?? 'off'
    switch (this.kind) {
      case 'colours':
      case 'visuals':
        this.useCanvas(160, 90)
        break
      case 'text':
        this.text = (p.text ?? '').trim() || 'Your words here'
        this.tint = NEON_COLOURS[p.tint ?? 2]?.[1] ?? '#ffffff'
        this.useCanvas(1024, 576)
        this.drawText()
        break
      case 'image': {
        if (!p.media?.startsWith('data:')) break
        const texture = new THREE.TextureLoader().load(p.media, () => (this.mesh.visible = true))
        texture.colorSpace = THREE.SRGBColorSpace
        this.material.map = texture
        this.material.needsUpdate = true
        break
      }
      case 'video': {
        if (!p.media) break
        const wanted = key
        void videoUrl(p.media).then((url) => {
          if (!url || this.key !== wanted) return
          const v = document.createElement('video')
          Object.assign(v, { src: url, loop: true, muted: true, playsInline: true, autoplay: true })
          void v.play().catch(() => {})
          const texture = new THREE.VideoTexture(v)
          texture.colorSpace = THREE.SRGBColorSpace
          this.video = v
          this.material.map = texture
          this.material.needsUpdate = true
          this.mesh.visible = true
        })
        break
      }
    }
  }

  private useCanvas(w: number, h: number): void {
    this.canvas = document.createElement('canvas')
    this.canvas.width = w
    this.canvas.height = h
    const texture = new THREE.CanvasTexture(this.canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.material.map = texture
    this.material.needsUpdate = true
    this.mesh.visible = true
  }

  private drawText(): void {
    const c = this.canvas!
    const g = c.getContext('2d')!
    g.fillStyle = '#05050a'
    g.fillRect(0, 0, c.width, c.height)
    // The words as big as they fit: on one line, or wrapped over two or three.
    const typed = this.text.split(/\n|\\n/).slice(0, 4)
    const words = this.text.split(/\s+/)
    const wrap = (n: number) => Array.from({ length: n }, (_, i) => words.slice(Math.round((i * words.length) / n), Math.round(((i + 1) * words.length) / n)).join(' ')).filter(Boolean)
    const fit = (list: string[]) => {
      let size = 220
      g.font = `700 ${size}px system-ui, sans-serif`
      while (size > 24 && (Math.max(...list.map((l) => g.measureText(l).width)) > c.width * 0.88 || size * list.length * 1.15 > c.height * 0.85)) {
        size -= 8
        g.font = `700 ${size}px system-ui, sans-serif`
      }
      return size
    }
    const options = typed.length > 1 ? [typed] : [1, 2, 3].filter((n) => n <= words.length).map(wrap)
    const best = options.map((list) => ({ list, size: fit(list) })).sort((a, b) => b.size - a.size)[0]
    const lines = best.list
    const size = best.size
    g.font = `700 ${size}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = this.tint
    g.shadowColor = this.tint
    g.shadowBlur = size * 0.25
    lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.15))
    ;(this.material.map as THREE.CanvasTexture).needsUpdate = true
  }

  /** Every frame: moving colours and visuals are redrawn. */
  tick(time: number): void {
    if (!this.canvas || (this.kind !== 'colours' && this.kind !== 'visuals')) return
    const c = this.canvas
    const g = c.getContext('2d')!
    const { width: w, height: h } = c
    if (this.kind === 'colours') {
      // Slow washes of colour drifting across.
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, hue(time * 0.05))
      grad.addColorStop(0.5, hue(time * 0.05 + 0.25))
      grad.addColorStop(1, hue(time * 0.05 + 0.5))
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    } else {
      // Club visuals: a tunnel of rings and turning rays, pulsing at 124 bpm.
      const beat = (time * 124) / 60
      const pulse = Math.exp(-(beat % 1) * 4)
      g.fillStyle = '#000'
      g.fillRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      for (let k = 0; k < 7; k++) {
        const r = (((time * 0.6 + k / 7) % 1) ** 1.6) * w * 0.75
        g.strokeStyle = hue(beat * 0.02 + k * 0.08, 1, 0.55)
        g.lineWidth = 2 + r * 0.04
        g.beginPath()
        g.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2)
        g.stroke()
      }
      g.globalCompositeOperation = 'lighter'
      for (let k = 0; k < 12; k++) {
        const a = time * 0.4 + (k / 12) * Math.PI * 2
        g.strokeStyle = hue(beat * 0.02 + 0.5, 1, 0.3 + pulse * 0.3)
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(cx, cy)
        g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w)
        g.stroke()
      }
      g.globalCompositeOperation = 'source-over'
    }
    ;(this.material.map as THREE.CanvasTexture).needsUpdate = true
  }

  private clear(): void {
    this.material.map?.dispose()
    this.material.map = null
    this.material.needsUpdate = true
    if (this.video) {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.video = null
    }
    this.canvas = null
    this.mesh.visible = false
  }

  dispose(): void {
    this.clear()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
