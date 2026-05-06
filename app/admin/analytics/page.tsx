import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface UserRow {
  id: string
  email: string
  preferred_name: string
  created_at: string
  last_used: string | null
  days_used: number
  plans_saved: number
  same_day_returns: number
  plan_updates: number
}

async function getAnalyticsData() {
  const supabase = createAdminClient()

  const todayUtc = new Date().toISOString().split('T')[0]
  const weekAgoUtc = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { count: dau },
    { count: wau },
    { count: totalUsers },
    { count: plansSavedToday },
    { count: returnsToday },
    { data: allUsers },
    { data: allEvents },
  ] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', `${todayUtc}T00:00:00Z`),
    supabase
      .from('analytics_events')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', `${weekAgoUtc}T00:00:00Z`),
    supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'plan_saved')
      .gte('created_at', `${todayUtc}T00:00:00Z`),
    supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'returned_same_day')
      .gte('created_at', `${todayUtc}T00:00:00Z`),
    supabase
      .from('user_profiles')
      .select('id, email, preferred_name, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('analytics_events')
      .select('user_id, event_type, created_at'),
  ])

  // Aggregate per-user stats from events
  const statsMap = new Map<string, {
    lastUsed: string | null
    dates: Set<string>
    plansSaved: number
    returns: number
    updates: number
  }>()

  for (const event of allEvents ?? []) {
    if (!statsMap.has(event.user_id)) {
      statsMap.set(event.user_id, { lastUsed: null, dates: new Set(), plansSaved: 0, returns: 0, updates: 0 })
    }
    const s = statsMap.get(event.user_id)!
    if (!s.lastUsed || event.created_at > s.lastUsed) s.lastUsed = event.created_at
    s.dates.add(event.created_at.split('T')[0])
    if (event.event_type === 'plan_saved') s.plansSaved++
    if (event.event_type === 'returned_same_day') s.returns++
    if (event.event_type === 'plan_updated') s.updates++
  }

  // Count distinct users for DAU/WAU (approximate — Supabase count with head:true counts rows not distinct)
  // Re-compute from events for accuracy
  const dauSet = new Set<string>()
  const wauSet = new Set<string>()
  for (const event of allEvents ?? []) {
    if (event.created_at >= `${todayUtc}T00:00:00Z`) dauSet.add(event.user_id)
    if (event.created_at >= `${weekAgoUtc}T00:00:00Z`) wauSet.add(event.user_id)
  }

  const userRows: UserRow[] = (allUsers ?? []).map((u) => {
    const s = statsMap.get(u.id)
    const lastUsed = s?.lastUsed ?? null
    const daysSince = lastUsed
      ? Math.floor((Date.now() - new Date(lastUsed).getTime()) / 86400000)
      : null
    return {
      id: u.id,
      email: u.email ?? '—',
      preferred_name: u.preferred_name ?? '—',
      created_at: u.created_at,
      last_used: lastUsed,
      days_used: s?.dates.size ?? 0,
      plans_saved: s?.plansSaved ?? 0,
      same_day_returns: s?.returns ?? 0,
      plan_updates: s?.updates ?? 0,
      days_since: daysSince,
    } as UserRow & { days_since: number | null }
  })

  return {
    dau: dauSet.size,
    wau: wauSet.size,
    totalUsers: totalUsers ?? 0,
    plansSavedToday: plansSavedToday ?? 0,
    returnsToday: returnsToday ?? 0,
    userRows,
  }
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()
  const now = new Date().toUTCString()

  return (
    <div style={{ fontFamily: 'monospace', padding: '32px', maxWidth: '1100px', margin: '0 auto', color: '#e4e4e7', background: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#fff' }}>DayOS Analytics</h1>
        <p style={{ fontSize: '12px', color: '#71717a', margin: '4px 0 0' }}>{now} · UTC</p>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '40px' }}>
        {[
          { label: 'DAU', value: data.dau },
          { label: 'WAU', value: data.wau },
          { label: 'Total users', value: data.totalUsers },
          { label: 'Plans saved today', value: data.plansSavedToday },
          { label: 'Same-day returns today', value: data.returnsToday },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#71717a', marginTop: '6px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* User table */}
      <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Users ({data.userRows.length})
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a', color: '#71717a', textAlign: 'left' }}>
              {['User', 'Email', 'Last used', 'Days since', 'Days used', 'Plans saved', 'Returns', 'Plan updates'].map(h => (
                <th key={h} style={{ padding: '8px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.userRows.map((row) => {
              const r = row as UserRow & { days_since: number | null }
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid #18181b' }}>
                  <td style={{ padding: '10px 12px', color: '#fff' }}>{row.preferred_name}</td>
                  <td style={{ padding: '10px 12px', color: '#a1a1aa' }}>{row.email}</td>
                  <td style={{ padding: '10px 12px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                    {row.last_used ? new Date(row.last_used).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: r.days_since === 0 ? '#4ade80' : r.days_since !== null && r.days_since <= 2 ? '#facc15' : '#71717a' }}>
                    {r.days_since === null ? '—' : r.days_since === 0 ? 'today' : `${r.days_since}d`}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#e4e4e7' }}>{row.days_used}</td>
                  <td style={{ padding: '10px 12px', color: '#e4e4e7' }}>{row.plans_saved}</td>
                  <td style={{ padding: '10px 12px', color: '#e4e4e7' }}>{row.same_day_returns}</td>
                  <td style={{ padding: '10px 12px', color: '#e4e4e7' }}>{row.plan_updates}</td>
                </tr>
              )
            })}
            {data.userRows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '24px 12px', color: '#71717a', textAlign: 'center' }}>No users yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
