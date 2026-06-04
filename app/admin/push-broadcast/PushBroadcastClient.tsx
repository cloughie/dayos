'use client'

import { useState } from 'react'

interface BroadcastResult {
  dryRun: boolean
  total: number
  sent: number
  failed: number
  expired: number
}

const S = {
  page:    { fontFamily: 'monospace', padding: '48px', maxWidth: '600px', margin: '0 auto', color: '#e4e4e7', background: '#09090b', minHeight: '100vh' } as React.CSSProperties,
  h1:      { fontSize: '18px', fontWeight: 600, color: '#fff', margin: '0 0 8px' } as React.CSSProperties,
  muted:   { fontSize: '12px', color: '#71717a', margin: '0 0 32px' } as React.CSSProperties,
  label:   { fontSize: '11px', color: '#71717a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' },
  box:     { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', marginBottom: '24px' } as React.CSSProperties,
  key:     { color: '#71717a' } as React.CSSProperties,
  val:     { color: '#fff' } as React.CSSProperties,
  row:     { display: 'flex', gap: '12px', marginBottom: '12px' } as React.CSSProperties,
  btn:     { padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'monospace' } as React.CSSProperties,
  danger:  { background: '#ef4444', color: '#fff' } as React.CSSProperties,
  neutral: { background: '#27272a', color: '#e4e4e7' } as React.CSSProperties,
  confirm: { background: '#18181b', border: '1px solid #ef4444', borderRadius: '8px', padding: '20px', marginBottom: '24px' } as React.CSSProperties,
  result:  { background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px', marginBottom: '24px', fontSize: '13px', lineHeight: 1.8 } as React.CSSProperties,
  error:   { color: '#f87171', fontSize: '13px', marginBottom: '16px' } as React.CSSProperties,
  sent:    { color: '#4ade80' } as React.CSSProperties,
  warn:    { color: '#facc15' } as React.CSSProperties,
}

export default function PushBroadcastClient() {
  const [result, setResult] = useState<BroadcastResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function call(dryRun: boolean) {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/push-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Push Broadcast</h1>
      <p style={S.muted}>Admin only · Temporary page</p>

      <div style={S.label}>Message</div>
      <div style={S.box}>
        <div><span style={S.key}>title  </span><span style={S.val}>🔥 Streaks are now live</span></div>
        <div><span style={S.key}>body   </span><span style={S.val}>Every daily check-in now counts toward your streak.</span></div>
        <div><span style={S.key}>url    </span><span style={S.val}>/conversation</span></div>
      </div>

      {error && <p style={S.error}>{error}</p>}

      {result && (
        <div style={S.result}>
          <div style={S.label}>{result.dryRun ? 'Dry run result' : 'Send result'}</div>
          <div><span style={S.key}>total   </span><span style={S.val}>{result.total}</span></div>
          <div><span style={S.key}>sent    </span><span style={result.sent > 0 ? S.sent : S.val}>{result.sent}</span></div>
          <div><span style={S.key}>failed  </span><span style={result.failed > 0 ? S.warn : S.val}>{result.failed}</span></div>
          <div><span style={S.key}>expired </span><span style={S.val}>{result.expired}</span></div>
        </div>
      )}

      {confirming ? (
        <div style={S.confirm}>
          <p style={{ color: '#fca5a5', margin: '0 0 16px', fontSize: '13px' }}>
            Send to <strong>{result?.total ?? '?'} user{result?.total !== 1 ? 's' : ''}</strong>? This cannot be undone.
          </p>
          <div style={S.row}>
            <button style={{ ...S.btn, ...S.danger }} onClick={() => call(false)} disabled={loading}>
              {loading ? 'Sending…' : 'Confirm send'}
            </button>
            <button style={{ ...S.btn, ...S.neutral }} onClick={() => setConfirming(false)} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={S.row}>
          <button style={{ ...S.btn, ...S.neutral }} onClick={() => call(true)} disabled={loading}>
            {loading ? 'Running…' : 'Dry run'}
          </button>
          <button style={{ ...S.btn, ...S.danger }} onClick={() => setConfirming(true)} disabled={loading}>
            Send broadcast
          </button>
        </div>
      )}
    </div>
  )
}
