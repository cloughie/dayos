import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PushBroadcastClient from './PushBroadcastClient'

export const dynamic = 'force-dynamic'

async function getBroadcastHistory() {
  const admin = createAdminClient()

  const { data: broadcasts } = await admin
    .from('push_broadcasts')
    .select('id, title, total_recipients, sent_count, failed_count, expired_count, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!broadcasts?.length) return []

  // Fetch all open events for these broadcasts and group by broadcast_id.
  const ids = broadcasts.map((b) => b.id)
  const { data: openEvents } = await admin
    .from('analytics_events')
    .select('metadata')
    .eq('event_type', 'push_broadcast_opened')

  const opensByBroadcast = new Map<string, number>()
  for (const e of openEvents ?? []) {
    const bid = (e.metadata as Record<string, unknown>)?.broadcast_id as string | undefined
    if (bid && ids.includes(bid)) {
      opensByBroadcast.set(bid, (opensByBroadcast.get(bid) ?? 0) + 1)
    }
  }

  return broadcasts.map((b) => ({ ...b, opens: opensByBroadcast.get(b.id) ?? 0 }))
}

export default async function PushBroadcastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('user_profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return (
      <div style={{ fontFamily: 'monospace', padding: '48px', color: '#e4e4e7', background: '#09090b', minHeight: '100vh' }}>
        <p style={{ color: '#f87171' }}>403 — Not authorised.</p>
      </div>
    )
  }

  const history = await getBroadcastHistory()

  return (
    <div style={{ fontFamily: 'monospace', background: '#09090b', minHeight: '100vh' }}>
      <PushBroadcastClient />

      {/* ── Broadcast history ── */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 48px 64px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>
          Broadcast history
        </h2>
        {history.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#52525b' }}>No broadcasts sent yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #27272a', color: '#71717a', textAlign: 'left' }}>
                {['Date', 'Title', 'Total', 'Sent', 'Failed', 'Expired', 'Opens'].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #18181b' }}>
                  <td style={{ padding: '8px', color: '#71717a', whiteSpace: 'nowrap' }}>
                    {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ padding: '8px', color: '#e4e4e7', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.title}
                  </td>
                  <td style={{ padding: '8px', color: '#e4e4e7' }}>{b.total_recipients}</td>
                  <td style={{ padding: '8px', color: b.sent_count > 0 ? '#4ade80' : '#71717a' }}>{b.sent_count}</td>
                  <td style={{ padding: '8px', color: b.failed_count > 0 ? '#facc15' : '#71717a' }}>{b.failed_count}</td>
                  <td style={{ padding: '8px', color: '#71717a' }}>{b.expired_count}</td>
                  <td style={{ padding: '8px', color: b.opens > 0 ? '#60a5fa' : '#71717a' }}>{b.opens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
