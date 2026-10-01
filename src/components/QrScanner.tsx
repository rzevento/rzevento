import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, QrCode, X } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'

type Props = { onClose: () => void; onCode: (code: string) => void; code: string; setCode: (code: string) => void }

export function QrScanner({ onClose, onCode, code, setCode }: Props) {
  const readerId = useId()
  const handledRef = useRef(false)
  const onCodeRef = useRef(onCode)
  const cleanupRef = useRef<Promise<void>>(Promise.resolve())
  const [cameraError, setCameraError] = useState('')
  const [starting, setStarting] = useState(true)

  useEffect(() => { onCodeRef.current = onCode }, [onCode])

  function submit(value: string) {
    if (!value.trim() || handledRef.current) return
    handledRef.current = true
    // The parent shows validation immediately; camera teardown must not block it.
    onCodeRef.current(value.trim())
  }

  useEffect(() => {
    let active = true
    let scanner: Html5Qrcode | null = null
    const config = {
      fps: 15,
      qrbox: (width: number, height: number) => {
        const size = Math.floor(Math.min(width, height) * 0.72)
        return { width: size, height: size }
      },
      aspectRatio: 1,
    }
    const detected = (value: string) => { if (active) submit(value) }

    // Serialize setup and cleanup, including React StrictMode's effect replay.
    const startup = cleanupRef.current.then(async () => {
      if (!active) return
      try {
        scanner = new Html5Qrcode(readerId)
        try {
          await scanner.start({ facingMode: 'environment' }, config, detected, () => undefined)
        } catch (error) {
          if (!active) return
          const cameras = await Html5Qrcode.getCameras()
          if (!active) return
          if (!cameras.length) throw error
          const camera = cameras.find(item => /back|rear|environment|trasera/i.test(item.label)) || cameras[cameras.length - 1]
          await scanner.start(camera.id, config, detected, () => undefined)
        }
        if (active) setStarting(false)
      } catch {
        if (!active) return
        setStarting(false)
        setCameraError(window.isSecureContext
          ? 'No pudimos abrir la cámara. Activa el permiso de cámara para este sitio o usa el código manual.'
          : 'El escáner necesita una conexión segura (HTTPS). Usa el código manual o entra desde el enlace seguro.')
      }
    })

    return () => {
      active = false
      cleanupRef.current = startup.then(async () => {
        if (!scanner) return
        // If closed during startup, wait for it before releasing the camera.
        try { if (scanner.isScanning) await scanner.stop() } catch { /* camera already stopped */ }
        try { scanner.clear() } catch { /* reader already removed */ }
      })
    }
  }, [readerId])

  return <div className="modal-backdrop scanner-backdrop">
    <div className="scanner-card" role="dialog" aria-modal="true" aria-labelledby={`${readerId}-title`}>
      <button className="modal-close" onClick={onClose} aria-label="Cerrar escáner"><X size={19} /></button>
      <div className="scanner-heading"><QrCode size={22} /><div><p className="eyebrow orange">Registro rápido</p><h3 id={`${readerId}-title`}>Escanea el QR de la invitación</h3></div></div>
      <div className="scanner-preview">
        <div id={readerId} className="scanner-viewport" />
        {(starting || cameraError) && <div className="scanner-message" role={cameraError ? 'alert' : 'status'}>
          {cameraError && <AlertCircle size={25} />}<p>{cameraError || 'Abriendo cámara…'}</p>
        </div>}
      </div>
      <p className="scanner-help">Apunta la cámara al código QR del invitado.</p>
      <form className="manual-code" onSubmit={e => { e.preventDefault(); submit(code) }}>
        <input aria-label="Enlace o token de la invitación" value={code} onChange={e => setCode(e.target.value)} placeholder="Pega aquí el enlace o token" />
        <button type="submit" className="button button-dark small" disabled={!code.trim()}>Buscar</button>
      </form>
    </div>
  </div>
}
