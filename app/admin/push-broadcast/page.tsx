import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PushBroadcastClient from './PushBroadcastClient'

export const dynamic = 'force-dynamic'

export default async function PushBroadcastPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  if (!process.env.CHAT_DEBUG_USER_ID || user.id !== process.env.CHAT_DEBUG_USER_ID) {
    return (
      <div style={{ fontFamily: 'monospace', padding: '48px', color: '#e4e4e7', background: '#09090b', minHeight: '100vh' }}>
        <p style={{ color: '#f87171' }}>403 — Not authorised.</p>
      </div>
    )
  }

  return <PushBroadcastClient />
}
