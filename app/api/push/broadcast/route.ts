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

  const { data: enabledProfiles } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) {
    return NextResponse.json({ dryRun, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  // Web-only broadcast (APNs broadcast is V2)
  const { data: devices } = await supabase
    .from('push_devices')
    .select('user_id, endpoint, p256dh, auth')
    .eq('platform', 'web')
    .in('user_id', enabledProfiles.map((p) => p.id))

  const total = devices?.length ?? 0

  if (!total) {
    return NextResponse.json({ dryRun, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, total, sent: 0, failed: 0, expired: 0 })
  }

  let sent = 0
  let failed = 0
  let expired = 0

  for (const dev of devices!) {
    try {
      await webpush.sendNotification(
        { endpoint: dev.endpoint!, keys: { p256dh: dev.p256dh!, auth: dev.auth! } },
        JSON.stringify(BROADCAST_MESSAGE),
      )
      sent++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        expired++
        await supabase.from('push_devices').delete()
          .eq('user_id', dev.user_id)
          .eq('platform', 'web')
        await supabase.from('user_profiles')
          .update({ push_notifications_enabled: false })
          .eq('id', dev.user_id)
      } else {
        failed++
        console.error('[Broadcast] Send error for user:', dev.user_id, err)
      }
    }
  }

  console.log(`[Broadcast] total=${total} sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ dryRun: false, total, sent, failed, expired })
}
