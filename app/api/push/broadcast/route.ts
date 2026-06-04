import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

const BROADCAST_MESSAGE = {
  title: 'Your DayOS streak is here 🔥',
  body: 'Daily check-ins now track your streak. Open DayOS and keep it going.',
  url: '/conversation',
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dry_run') === 'true'

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const supabase = createAdminClient()

  // Fetch all users with push enabled and permission granted
  const { data: enabledProfiles } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) {
    return NextResponse.json({ dryRun, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  // Fetch their subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', enabledProfiles.map((p) => p.id))

  const total = subscriptions?.length ?? 0

  if (!total) {
    return NextResponse.json({ dryRun, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  if (dryRun) {
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
        // Expired/unregistered subscription — clean up, same as daily cron
        expired++
        await supabase.from('push_subscriptions').delete().eq('user_id', sub.user_id)
        await supabase.from('user_profiles').update({ push_notifications_enabled: false }).eq('id', sub.user_id)
      } else {
        failed++
        console.error('[Broadcast] Send error for user:', sub.user_id, err)
      }
    }
  }

  console.log(`[Broadcast] total=${total} sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ dryRun: false, total, sent, failed, expired })
}
