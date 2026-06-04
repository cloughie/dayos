'use client'

import { useState } from 'react'

const TITLE_MAX = 60
const BODY_MAX = 140

interface BroadcastResult {
  dryRun: boolean
  total: number
  sent: number
  failed: number
  expired: number
}

// ── Styles ──────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:     { fontFamily: 'monospace', padding: '48px', maxWidth: '640px', margin: '0 auto', color: '#e4e4e7', background: '#09090b', minHeight: '100vh' },
  h1:       { fontSize: '18px', fontWeight: 600, color: '#fff', margin: '0 0 4px' },
  subtitle: { fontSize: '12px', color: '#71717a', margin: '0 0 32px' },
  warning:  { fontSize: '12px', color: '#fca5a5', background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: '6px', padding: '10px 14px', marginBottom: '28px' },
  section:  { marginBottom: '24px' },
  label:    { fontSize: '11px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' },
  sublabel: { fontSize: '11px', color: '#52525b', marginLeft: '8px' },
  input:    { width: '100%', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 12px', color: '#e4e4e7', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', padding: '8px 12px', color: '#e4e4e7', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', minHeight: '72px' },
  charcount:{ fontSize: '11px', textAlign: 'right', marginTop: '4px' },
  invalid:  { borderColor: '#ef4444' },
  previewWrap: { marginBottom: '28px' },
  preview:  { display: 'inline-block', width: '100%', maxWidth: '360px', background: 'rgba(44,44,46,0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '12px 14px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' },
  pApp:     { fontSize: '11px', color: '#8e8e93', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' },
  pIcon:    { width: '14px', height: '14px', background: '#1a1a1a', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' },
  pTitle:   { fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px', lineHeight: 1.3, wordBreak: 'break-word' as const },
  pBody:    { fontSize: '13px', color: 'rgba(235,235,245,0.7)', lineHeight: 1.4, wordBreak: 'break-word' as const },
  dot:      { width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block' },
  row:      { display: 'flex', gap: '12px', alignItems: 'center' },
  btn:      { padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' },
  primary:  { background: '#27272a', color: '#e4e4e7' },
  danger:   { background: '#ef4444', color: '#fff' },
  disabled: { opacity: 0.4, cursor: 'not-allowed' },
  result:   { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '14px 16px', marginBottom: '24px', fontSize: '13px', lineHeight: 2 },
  modal:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modalBox: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px', padding: '28px', maxWidth: '460px', width: '90%' },
  modalH:   { fontSize: '15px', fontWeight: 600, color: '#fff', margin: '0 0 16px' },
  modalMsg: { background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', lineHeight: 1.8 },
  modalWarn:{ fontSize: '12px', color: '#fca5a5', marginBottom: '20px' },
  key:      { color: '#71717a' },
  val:      { color: '#fff' },
  green:    { color: '#4ade80' },
  yellow:   { color: '#facc15' },
  error:    { color: '#f87171', fontSize: '13px', marginBottom: '16px' },
}

// ── Validation ───────────────────────────────────────────────────────────────

function validate(title: string, body: string, url: string): string | null {
  if (!title.trim()) return 'Title is required'
  if (!body.trim()) return 'Body is required'
  if (title.trim().length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer`
  if (body.trim().length > BODY_MAX) return `Body must be ${BODY_MAX} characters or fewer`
  if (!url.trim().startsWith('/')) return 'URL must start with /'
  return null
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PushBroadcastClient() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/conversation')

  const [dryRunResult, setDryRunResult] = useState<BroadcastResult | null>(null)
  const [sendResult, setSendResult] = useState<BroadcastResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const validationError = validate(title, body, url)
  const canRun = !validationError && !loading
  // Send is only enabled after a dry run with the current field values.
  // Any field change clears dryRunResult, forcing a fresh dry run.
  const canSend = canRun && dryRunResult !== null && !sendResult

  function handleFieldChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value)
      setDryRunResult(null)  // must re-run dry run if message changes
      setSendResult(null)
      setError(null)
    }
  }

  async function call(dryRun: boolean) {
    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()
    const trimmedUrl = url.trim()
    const err = validate(trimmedTitle, trimmedBody, trimmedUrl)
    if (err) { setError(err); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/push-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun, title: trimmedTitle, body: trimmedBody, url: trimmedUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      if (dryRun) {
        setDryRunResult(data)
      } else {
        setSendResult(data)
        setDryRunResult(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  const titleLen = title.trim().length
  const bodyLen = body.trim().length

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Push Broadcast</h1>
      <p style={S.subtitle}>Admin only · /admin/push-broadcast</p>

      <div style={S.warning}>
        ⚠ This sends a push notification to all users with push notifications enabled.
      </div>

      {/* ── Message fields ── */}
      <div style={S.section}>
        <label style={S.label}>
          Title
          <span style={S.sublabel}>(required, max {TITLE_MAX})</span>
        </label>
        <input
          style={{ ...S.input, ...(titleLen > TITLE_MAX ? S.invalid : {}) }}
          value={title}
          onChange={handleFieldChange(setTitle)}
          placeholder="Notification title…"
          maxLength={TITLE_MAX + 10}
        />
        <div style={{ ...S.charcount, color: titleLen > TITLE_MAX ? '#ef4444' : '#52525b' }}>
          {titleLen}/{TITLE_MAX}
        </div>
      </div>

      <div style={S.section}>
        <label style={S.label}>
          Body
          <span style={S.sublabel}>(required, max {BODY_MAX})</span>
        </label>
        <textarea
          style={{ ...S.textarea, ...(bodyLen > BODY_MAX ? S.invalid : {}) }}
          value={body}
          onChange={handleFieldChange(setBody)}
          placeholder="Notification body…"
          maxLength={BODY_MAX + 10}
        />
        <div style={{ ...S.charcount, color: bodyLen > BODY_MAX ? '#ef4444' : '#52525b' }}>
          {bodyLen}/{BODY_MAX}
        </div>
      </div>

      <div style={S.section}>
        <label style={S.label}>
          Destination path
          <span style={S.sublabel}>(must start with /)</span>
        </label>
        <input
          style={S.input}
          value={url}
          onChange={handleFieldChange(setUrl)}
          placeholder="/conversation"
        />
      </div>

      {/* ── Device preview ── */}
      {(title || body) && (
        <div style={S.section}>
          <span style={S.label}>Preview</span>
          <div style={S.previewWrap}>
            <div style={S.preview}>
              <div style={S.pApp}>
                <span style={S.pIcon}>D</span>
                <span>DAYOS</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#636366' }}>now</span>
              </div>
              <div style={S.pTitle}>{title.trim() || <span style={{ color: '#52525b' }}>Title…</span>}</div>
              <div style={S.pBody}>{body.trim() || <span style={{ color: '#3a3a3c' }}>Body…</span>}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Errors ── */}
      {error && <p style={S.error}>{error}</p>}

      {/* ── Dry run result ── */}
      {dryRunResult && (
        <div style={{ ...S.result, borderColor: '#3f3f46' }}>
          <div style={{ ...S.label, marginBottom: '8px' }}>Dry run — {dryRunResult.total} recipient{dryRunResult.total !== 1 ? 's' : ''} would receive this</div>
          <div><span style={S.key}>total   </span><span style={S.val}>{dryRunResult.total}</span></div>
          <div><span style={S.key}>sent    </span><span style={S.key}>0 (dry run)</span></div>
        </div>
      )}

      {/* ── Send result ── */}
      {sendResult && (
        <div style={{ ...S.result, borderColor: sendResult.failed > 0 ? '#713f12' : '#14532d' }}>
          <div style={{ ...S.label, marginBottom: '8px' }}>Send result</div>
          <div><span style={S.key}>total   </span><span style={S.val}>{sendResult.total}</span></div>
          <div><span style={S.key}>sent    </span><span style={sendResult.sent > 0 ? S.green : S.val}>{sendResult.sent}</span></div>
          <div><span style={S.key}>failed  </span><span style={sendResult.failed > 0 ? S.yellow : S.val}>{sendResult.failed}</span></div>
          <div><span style={S.key}>expired </span><span style={S.val}>{sendResult.expired}</span></div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {!sendResult && (
        <div style={S.row}>
          <button
            style={{ ...S.btn, ...S.primary, ...(!canRun ? S.disabled : {}) }}
            onClick={() => call(true)}
            disabled={!canRun}
          >
            {loading && !confirming ? 'Running…' : 'Dry run'}
          </button>
          <button
            style={{ ...S.btn, ...S.danger, ...(!canSend ? S.disabled : {}) }}
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            title={!dryRunResult ? 'Run a dry run first' : undefined}
          >
            Send broadcast
          </button>
          {!dryRunResult && (
            <span style={{ fontSize: '11px', color: '#52525b' }}>Run a dry run first to enable Send</span>
          )}
        </div>
      )}

      {/* ── Confirmation modal ── */}
      {confirming && (
        <div style={S.modal} onClick={() => !loading && setConfirming(false)}>
          <div style={S.modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalH}>Confirm broadcast</h2>
            <div style={S.modalMsg}>
              <div><span style={S.key}>title   </span><span style={S.val}>{title.trim()}</span></div>
              <div><span style={S.key}>body    </span><span style={S.val}>{body.trim()}</span></div>
              <div><span style={S.key}>url     </span><span style={S.val}>{url.trim()}</span></div>
              <div><span style={S.key}>to      </span><span style={S.val}>{dryRunResult?.total} user{dryRunResult?.total !== 1 ? 's' : ''}</span></div>
            </div>
            <p style={S.modalWarn}>This will send immediately and cannot be undone.</p>
            <div style={S.row}>
              <button
                style={{ ...S.btn, ...S.danger, ...(loading ? S.disabled : {}) }}
                onClick={() => call(false)}
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Confirm send'}
              </button>
              <button
                style={{ ...S.btn, ...S.primary, ...(loading ? S.disabled : {}) }}
                onClick={() => setConfirming(false)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
