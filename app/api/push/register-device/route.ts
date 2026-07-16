import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Called by the native iOS app after APNs registration.
// Stores/updates the device's APNs token and enables push notifications for the user.

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { apns_token, timezone } = await request.json()
    if (!apns_token || typeof apns_token !== 'string') {
      return NextResponse.json({ error: 'Missing apns_token' }, { status: 400 })
    }

    // Remove this APNs token from any other user before upserting — prevents
    // duplicate notifications when a device re-registers under a new account.
    const adminClient = createAdminClient()
    await adminClient.from('push_devices')
      .delete()
      .eq('apns_token', apns_token)
      .neq('user_id', user.id)

    const { error: upsertError } = await supabase.from('push_devices').upsert({
      user_id: user.id,
      platform: 'ios',
      apns_token,
      timezone: timezone ?? 'UTC',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' })

    if (upsertError) {
      console.error('[Push/iOS] Upsert failed:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // Mark push as enabled and permission as granted
    await supabase.from('user_profiles').update({
      push_notifications_enabled: true,
      push_notifications_permission_status: 'granted',
    }).eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Push/iOS] Register error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabase.from('push_devices').delete()
      .eq('user_id', user.id)
      .eq('platform', 'ios')

    // Only disable the preference flag if the user has no remaining push devices
    const { count } = await supabase.from('push_devices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) === 0) {
      await supabase.from('user_profiles')
        .update({ push_notifications_enabled: false })
        .eq('id', user.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Push/iOS] Unregister error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
