import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PushBroadcastClient from './PushBroadcastClient'

export const dynamic = 'force-dynamic'

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

  return <PushBroadcastClient />
}
