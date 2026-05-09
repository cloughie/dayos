import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { endpoint, p256dh, auth, timezone } = await request.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { error: upsertError } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      timezone: timezone ?? 'UTC',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('[Push] Upsert failed:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Push] Subscribe error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
