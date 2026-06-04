import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BROADCAST_MESSAGE = {
  title: '🔥 Streaks are now live',
  body: 'Every daily check-in now counts toward your streak.',
  url: '/conversation',
}

export async function POST(request: Request) {
  // Verify the logged-in user is the authorised admin.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.CHAT_DEBUG_USER_ID || user.id !== process.env.CHAT_DEBUG_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { dry_run } = await request.json().catch(() => ({ dry_run: false }))

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const admin = createAdminClient()

  const { data: enabledProfiles } = await admin
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) {
    return NextResponse.json({ dryRun: dry_run, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', enabledProfiles.map((p) => p.id))

  const total = subscriptions?.length ?? 0

  if (!total) {
    return NextResponse.json({ dryRun: dry_run, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  if (dry_run) {
    return NextResponse.json({ dryRun: true, total, sent: 0, failed: 0, expired: 0 })
  }

  let sent = 0
  let failed = 0
  let expired = 0

  for (const sub of subscriptions!) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(BROADCAST_MESSAGE),
      )
      sent++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        expired++
        await admin.from('push_subscriptions').delete().eq('user_id', sub.user_id)
        await admin.from('user_profiles').update({ push_notifications_enabled: false }).eq('id', sub.user_id)
      } else {
        failed++
        console.error('[AdminBroadcast] Send error for user:', sub.user_id, err)
      }
    }
  }

  console.log(`[AdminBroadcast] total=${total} sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ dryRun: false, total, sent, failed, expired })
}
