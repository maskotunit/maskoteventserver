import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'

type Props = {
  facing: 'user' | 'environment'
  // QR mode: continuously decode codes with the browser's on-device BarcodeDetector
  onCode?: (code: string) => void
  // Photo mode: render a capture button that hands the current frame back
  onFrame?: (video: HTMLVideoElement) => void
  captureLabel?: string
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

export function CameraPanel({ facing, onCode, onFrame, captureLabel = 'Capture' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  async function start() {
    setError('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
      setStream(s)
    } catch {
      setError('Camera unavailable — check permissions, or use manual entry.')
    }
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [stream])

  useEffect(() => {
    if (!stream || !onCodeRef.current) return
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
    if (!Ctor) {
      setError('This browser has no built-in QR decoder — type or paste the ticket code instead.')
      return
    }
    const detector = new Ctor({ formats: ['qr_code', 'code_128', 'ean_13'] })
    let last = ''
    let active = true
    const tick = async () => {
      if (!active) return
      const v = videoRef.current
      if (v && v.readyState >= 2) {
        const codes = await detector.detect(v).catch(() => [])
        const value = codes[0]?.rawValue
        if (value && value !== last) {
          last = value
          onCodeRef.current?.(value)
          setTimeout(() => (last = ''), 2500)
        }
      }
      setTimeout(tick, 250)
    }
    tick()
    return () => {
      active = false
    }
  }, [stream])

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <div className="relative aspect-[4/3] w-full">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
        ) : (
          <button
            onClick={start}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-mute transition hover:text-chalk"
          >
            <Camera className="h-8 w-8" />
            <span className="text-sm font-medium">Start camera</span>
          </button>
        )}
        {stream && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`border-2 border-volt/70 ${facing === 'user' ? 'h-3/4 w-[37.5%] rounded-[50%]' : 'h-1/2 w-1/2 rounded-xl'}`}
            />
          </div>
        )}
      </div>
      {(stream || error) && (
        <div className="flex items-center gap-2 border-t border-line p-2">
          {error && <p className="flex-1 px-1 text-xs text-hold">{error}</p>}
          {stream && onFrame && (
            <button className="btn-primary flex-1" onClick={() => videoRef.current && onFrame(videoRef.current)}>
              <Camera className="h-4 w-4" /> {captureLabel}
            </button>
          )}
          {stream && (
            <button className="btn-ghost ml-auto" onClick={stop} aria-label="Stop camera">
              <CameraOff className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
