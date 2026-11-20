import { useEffect, useRef, useState, type CSSProperties } from 'react'

type Mode = 'upload' | 'live'
type Result = { label: string; confidence: number } | null

// --- DEPLOYMENT CONFIGURATION ---
// Reads VITE_API_URL at build time on Vercel, or falls back to local backend in dev
const RAW_API = (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`).trim()
const API_HTTP = RAW_API.replace(/\/+$/, '')
const API_WS = API_HTTP.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://') + '/ws/crack'

const TICKS = 40

// "Crack Detected (98.7%)" -> { label, confidence }
const parsePrediction = (text: string): Result => {
  const m = text.match(/^(.*?)\s*\(([\d.]+)%\)/)
  return m ? { label: m[1], confidence: parseFloat(m[2]) } : null
}
const isCrack = (label?: string) =>
  !!label && label.includes('Crack') && !label.includes('No Crack')

const RED = '#d9392b'
const GREEN = '#12805c'

const css = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;500;600;700;800&display=swap');

.app { --ink:#101216; --muted:#6b7078; --line:#d5d7db; --paper:#ecedef; --card:#f7f7f8;
  min-height:100vh; box-sizing:border-box; padding:28px clamp(16px,4vw,48px) 40px;
  background:var(--paper); color:var(--ink);
  font-family:'Bricolage Grotesque','Segoe UI',system-ui,sans-serif; }
.app * { box-sizing:border-box; }
.wrap { max-width:1120px; margin:0 auto; }

.top { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; letter-spacing:-.3px; }
.mark { width:26px; height:26px; border-radius:8px; background:var(--ink); position:relative; }
.mark::after { content:''; position:absolute; left:6px; top:5px; width:14px; height:16px;
  border-left:2px solid #fff; border-bottom:2px solid #fff; transform:skewX(-18deg) rotate(8deg); border-radius:1px; }

.seg { display:flex; padding:4px; border-radius:999px; background:#dcdee1; }
.seg button { border:0; background:transparent; padding:9px 20px; border-radius:999px; cursor:pointer;
  font:600 14px inherit; font-family:inherit; color:var(--muted); transition:background .2s, color .2s; }
.seg button[aria-pressed=true] { background:var(--ink); color:#fff; }

.hero { margin:44px 0 28px; max-width:720px; }
.hero h1 { margin:0; font-size:clamp(2.4rem,6vw,4.4rem); line-height:.98; letter-spacing:-.045em; font-weight:700;
  font-variation-settings:'opsz' 96; }
.hero p { margin:16px 0 0; font-size:17px; line-height:1.5; color:var(--muted); max-width:46ch; }

.grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:20px; align-items:stretch; }
@media (max-width:880px){ .grid { grid-template-columns:1fr; } }

.stage { --tone:rgba(255,255,255,.55); position:relative; aspect-ratio:4/3; border-radius:24px; overflow:hidden;
  background-color:#14161a;
  background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
  background-size:32px 32px; color:#fff; display:grid; place-items:center; }
.stage.drag { outline:2px solid #fff; outline-offset:-10px; }
.stage img, .stage video { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#000; }
.c { position:absolute; width:30px; height:30px; border:0 solid var(--tone); z-index:3; transition:border-color .3s; pointer-events:none; }
.c.tl{ top:16px; left:16px; border-top-width:3px; border-left-width:3px; border-top-left-radius:8px; }
.c.tr{ top:16px; right:16px; border-top-width:3px; border-right-width:3px; border-top-right-radius:8px; }
.c.bl{ bottom:16px; left:16px; border-bottom-width:3px; border-left-width:3px; border-bottom-left-radius:8px; }
.c.br{ bottom:16px; right:16px; border-bottom-width:3px; border-right-width:3px; border-bottom-right-radius:8px; }

.empty { position:relative; z-index:2; text-align:center; padding:24px; display:flex; flex-direction:column; gap:6px; align-items:center; }
.empty strong { font-size:22px; letter-spacing:-.02em; font-weight:600; }
.empty span { color:rgba(255,255,255,.55); font-size:14px; }
.drop { cursor:pointer; position:absolute; inset:0; border:0; background:transparent; color:inherit; font-family:inherit;
  display:grid; place-items:center; z-index:2; }
.drop:focus-visible, .pbtn:focus-visible, .seg button:focus-visible { outline:3px solid #4f7cff; outline-offset:3px; }

.scan { position:absolute; left:0; right:0; height:2px; z-index:4; background:#fff;
  box-shadow:0 0 18px 4px rgba(255,255,255,.55); animation:sweep 1.5s ease-in-out infinite alternate; }
@keyframes sweep { from { top:4%; } to { top:96%; } }
.dim { position:absolute; inset:0; background:rgba(10,12,16,.35); z-index:3; }

.panel { background:var(--card); border:1px solid var(--line); border-radius:24px; padding:28px;
  display:flex; flex-direction:column; gap:22px; min-height:320px; }
.k { font-size:13px; color:var(--muted); font-weight:500; }
.label { font-size:clamp(1.8rem,3.2vw,2.5rem); letter-spacing:-.035em; line-height:1.05; font-weight:700; margin:6px 0 0; }
.big { display:flex; align-items:baseline; gap:4px; font-size:clamp(3.4rem,7vw,5.2rem); font-weight:300;
  letter-spacing:-.06em; line-height:1; font-variant-numeric:tabular-nums; font-variation-settings:'opsz' 96; }
.big small { font-size:.4em; letter-spacing:0; color:var(--muted); font-weight:500; }
.meter { display:grid; grid-template-columns:repeat(${TICKS},1fr); gap:3px; height:26px; }
.meter i { border-radius:2px; background:#d9dbde; transition:background .25s; }
.meter i.on { background:var(--tone2); }
.note { font-size:15px; line-height:1.5; color:var(--ink); margin:0; }
.fade { animation:rise .4s ease both; }
@keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
.err { padding:14px 16px; border-radius:14px; background:#fbe9e7; color:#8f2a20; font-size:14px; line-height:1.45; }
.idle { margin-top:auto; color:var(--muted); font-size:15px; line-height:1.5; }
.spacer { flex:1; }

.pbtn { border:0; cursor:pointer; font:600 15px inherit; font-family:inherit; padding:14px 22px; border-radius:999px;
  background:var(--ink); color:#fff; transition:transform .15s, opacity .15s; }
.pbtn:hover:not(:disabled) { transform:translateY(-1px); }
.pbtn.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
.pbtn:disabled { opacity:.4; cursor:not-allowed; }

.thr { display:flex; flex-direction:column; gap:8px; }
.thr .row { display:flex; justify-content:space-between; font-size:14px; }
.thr b { font-variant-numeric:tabular-nums; }
.thr input { width:100%; accent-color:var(--ink); }
.thr p { margin:0; font-size:13px; color:var(--muted); line-height:1.45; }

.foot { margin-top:28px; font-size:13px; color:var(--muted); max-width:62ch; line-height:1.5; }

@media (prefers-reduced-motion:reduce){ .scan{ animation:none; top:50%; } .fade{ animation:none; } }
`

function Verdict({ result, error, busy, idleText }: {
  result: Result; error?: string | null; busy?: boolean; idleText: string
}) {
  if (error) return <div className="err fade" role="alert">{error}</div>
  if (busy) return <div className="idle">Analyzing the image…</div>
  if (!result) return <div className="idle">{idleText}</div>

  const crack = isCrack(result.label)
  const tone = crack ? RED : GREEN
  const on = Math.round((Math.min(100, Math.max(0, result.confidence)) / 100) * TICKS)
  return (
    <div className="fade" style={{ '--tone2': tone, display: 'flex', flexDirection: 'column', gap: 20 } as CSSProperties}>
      <div>
        <div className="k">Result</div>
        <h2 className="label" style={{ color: tone }}>{result.label}</h2>
      </div>
      <div>
        <div className="k" style={{ marginBottom: 6 }}>Model confidence</div>
        <div className="big">{result.confidence.toFixed(1)}<small>%</small></div>
      </div>
      <div className="meter" aria-hidden>
        {Array.from({ length: TICKS }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}
      </div>
      <p className="note">
        {crack ? 'Cracking found in this image.' : 'No cracking found in this image.'}
      </p>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<Mode>('upload')

  // ---- Live camera ----
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const intervalRef = useRef<number | null>(null)
  const thresholdRef = useRef(0.5)
  const inflightRef = useRef(0)
  const startingRef = useRef(false)
  const [streaming, setStreaming] = useState(false)
  const [threshold, setThreshold] = useState(0.5)
  const [liveResult, setLiveResult] = useState<Result>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  useEffect(() => { thresholdRef.current = threshold }, [threshold])

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    const ws = wsRef.current
    wsRef.current = null
    if (ws) { ws.onclose = null; ws.close() }
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach((t) => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    inflightRef.current = 0
    setStreaming(false)
  }

  useEffect(() => stopCamera, [])

  const startCamera = async () => {
    if (startingRef.current) return
    startingRef.current = true
    setLiveError(null)
    setLiveResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setLiveError('Camera access was blocked or no camera was found.')
      startingRef.current = false
      return
    }

    const ws = new WebSocket(API_WS)
    wsRef.current = ws
    ws.onmessage = (e) => {
      inflightRef.current = 0
      const parsed = parsePrediction(e.data)
      if (parsed) { setLiveResult(parsed); setLiveError(null) }
      else setLiveError(e.data)
    }
    ws.onerror = () => setLiveError('Cannot reach the server.')
    ws.onclose = () => stopCamera()
    ws.onopen = () => {
      intervalRef.current = window.setInterval(() => {
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || ws.readyState !== WebSocket.OPEN || !video.videoWidth) return
        if (inflightRef.current && Date.now() - inflightRef.current < 3000) return
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext('2d')!.drawImage(video, 0, 0)
        inflightRef.current = Date.now()
        ws.send(JSON.stringify({
          image: canvas.toDataURL('image/jpeg', 0.7),
          threshold: thresholdRef.current,
        }))
      }, 500)
    }
    setStreaming(true)
    startingRef.current = false
  }

  // ---- Upload ----
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<Result>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const analyzeFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('That file is not an image. Choose a JPG, PNG or WEBP.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setUploadResult(null)
    setUploadError(null)
    setIsUploading(true)

    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API_HTTP}/api/predict-upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (data.error) setUploadError(data.error)
      else setUploadResult({ label: data.label, confidence: Number(data.confidence) })
    } catch {
      setUploadError('Could not reach the server. Check that the API is running.')
    } finally {
      setIsUploading(false)
    }
  }

  const switchMode = (m: Mode) => { if (m !== mode) { stopCamera(); setMode(m) } }

  const activeResult = mode === 'upload' ? uploadResult : liveResult
  const tone = activeResult ? (isCrack(activeResult.label) ? RED : GREEN) : 'rgba(255,255,255,.55)'
  const scanning = mode === 'upload' ? isUploading : streaming

  return (
    <div className="app">
      <style>{css}</style>
      <div className="wrap">
        <header className="top">
          <div className="brand"><span className="mark" />Crackscan</div>
          <nav className="seg" aria-label="Input source">
            {(['upload', 'live'] as Mode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => switchMode(m)}>
                {m === 'upload' ? 'Upload' : 'Live camera'}
              </button>
            ))}
          </nav>
        </header>

        <section className="hero">
          <h1>Is this surface sound?</h1>
          <p>Add a close-up photo of concrete, or point your camera at it. The model checks it for cracks.</p>
        </section>

        <main className="grid">
          <div
            className={`stage${dragging ? ' drag' : ''}`}
            style={{ '--tone': tone } as CSSProperties}
            onDragOver={(e) => { if (mode !== 'upload') return; e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (mode !== 'upload') return
              e.preventDefault(); setDragging(false); analyzeFile(e.dataTransfer.files[0])
            }}
          >
            <span className="c tl" /><span className="c tr" /><span className="c bl" /><span className="c br" />

            {mode === 'upload' && (
              <>
                {previewUrl && <img src={previewUrl} alt="Uploaded surface" />}
                {!previewUrl && (
                  <button className="drop" onClick={() => fileInputRef.current?.click()}>
                    <span className="empty">
                      <strong>Drop an image here</strong>
                      <span>or click to browse · JPG, PNG, WEBP</span>
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef} type="file" accept="image/*" hidden
                  onChange={(e) => { analyzeFile(e.target.files?.[0]); e.target.value = '' }}
                />
              </>
            )}

            {mode === 'live' && (
              <>
                <video ref={videoRef} playsInline muted style={{ display: streaming ? 'block' : 'none' }} />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                {!streaming && (
                  <div className="empty"><strong>Camera is off</strong><span>Start the camera to inspect a surface live.</span></div>
                )}
              </>
            )}

            {scanning && <><div className="dim" style={{ opacity: mode === 'live' ? 0 : 1 }} /><div className="scan" /></>}
          </div>

          <aside className="panel">
            {mode === 'upload' ? (
              <>
                <Verdict
                  result={uploadResult} error={uploadError} busy={isUploading}
                  idleText="Your result will show up here once you add an image."
                />
                <div className="spacer" />
                <button className="pbtn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {previewUrl ? 'Choose another image' : 'Choose an image'}
                </button>
              </>
            ) : (
              <>
                <Verdict
                  result={liveResult} error={liveError}
                  idleText={streaming ? 'Looking for a result…' : 'Start the camera and results update about twice a second.'}
                />
                <div className="spacer" />
                <div className="thr">
                  <div className="row"><span>Sensitivity threshold</span><b>{threshold.toFixed(2)}</b></div>
                  <input
                    type="range" min="0.1" max="0.9" step="0.05" value={threshold}
                    aria-label="Decision threshold"
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  />
                  <p>Lower flags more cracks but gives more false alarms. Higher is stricter.</p>
                </div>
                {streaming
                  ? <button className="pbtn ghost" onClick={stopCamera}>Stop camera</button>
                  : <button className="pbtn" onClick={startCamera}>Start camera</button>}
              </>
            )}
          </aside>
        </main>

        <footer className="foot">
          Trained on close-up concrete surface images. Results on other scenes may be unreliable.
        </footer>
      </div>
    </div>
  )
}

export default App