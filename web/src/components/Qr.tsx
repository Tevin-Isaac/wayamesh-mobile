import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { Icon } from './Icon'

export function QrCode({ value, label, ecl = 'M', dark = false }: { value: string; label: string; ecl?: 'L' | 'M' | 'Q'; dark?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { errorCorrectionLevel: ecl, margin: 1, width: 560, color: { dark: '#07070F', light: '#FFFFFF' } })
      .then((u) => !cancelled && setSrc(u))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [value, ecl])
  return (
    <div className={`qr-card ${dark ? 'dark' : ''}`}>
      {src ? <img src={src} alt={label} /> : <span className="spinner" role="status" aria-label="Generating QR code" />}
    </div>
  )
}

/** Reads QR codes from the camera. Decoding happens on the device, so it works with no internet. */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cb = useRef(onResult)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    cb.current = onResult
  }, [onResult])

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 720 / video.videoWidth)
        canvas.width = Math.floor(video.videoWidth * scale)
        canvas.height = Math.floor(video.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            cb.current(code.data)
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not available in this browser (it needs HTTPS or localhost). Paste the code instead.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const v = videoRef.current
        if (v) {
          v.srcObject = s
          void v.play()
        }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setError('Camera access is required to scan QR codes. Allow it in your browser, or paste the code instead.'))
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (error) {
    return (
      <div className="scanner" style={{ display: 'grid', placeItems: 'center', padding: 24, background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center', gap: 8 }}>
        <div className="stack center-text" style={{ alignItems: 'center' }}>
          <Icon name="x" size={40} className="muted" />
          <p className="subtitle" role="alert">{error}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted aria-label="Camera preview" />
      <canvas ref={canvasRef} hidden />
      <div className="frame" />
    </div>
  )
}
