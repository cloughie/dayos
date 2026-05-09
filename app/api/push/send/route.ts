import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

const MESSAGES = [
  "Ready for today's check-in?",
  'Time for your DayOS check-in.',
  'Take five minutes to check in with yourself.',
  'Check in before the day gets away from you.',
  'Clear your head for the day — check in with DayOS.',
  'Five minutes for clarity? Time to check in.',
  'Morning. Ready to check in?',
  'Check in and get clear on what matters today.',
]

function pickMessage(last: string | null): string {
  const pool = last ? MESSAGES.filter((m) => m !== last) : MESSAGES
  return pool[Math.floor(Math.random() * pool.length)]
}

// Returns the hour (0-23) in the given IANA timezone.
function localHour(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  return h % 24 // formatToParts can return '24' for midnight in some environments
}

// Returns YYYY-MM-DD in the given IANA timezone.
function localDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const supabase = createAdminClient()
  const now = new Date()

  // Users who have opted in and granted permission
  const { data: enabledProfiles } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, timezone, last_notification_body, last_sent_at')
    .in('user_id', enabledProfiles.map((p) => p.id))

  if (!subscriptions?.length) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  let sent = 0

  for (const sub of subscriptions) {
    try {
      // Only fire at 8am user local time
      if (localHour(now, sub.timezone) !== 8) continue

      // At most once per local day
      if (sub.last_sent_at) {
        if (localDate(new Date(sub.last_sent_at), sub.timezone) === localDate(now, sub.timezone)) continue
      }

      // Skip if user has already started a check-in today (in their local timezone)
      const today = localDate(now, sub.timezone)
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: events } = await supabase
        .from('analytics_events')
        .select('created_at')
        .eq('user_id', sub.user_id)
        .eq('event_type', 'daily_checkin_started')
        .gte('created_at', since24h)

      const usedToday = (events ?? []).some(
        (e) => localDate(new Date(e.created_at), sub.timezone) === today,
      )
      if (usedToday) continue

      const body = pickMessage(sub.last_notification_body)

      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'DayOS', body, url: '/conversation' }),
      )

      await supabase
        .from('push_subscriptions')
        .update({
          last_notification_body: body,
          last_sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('user_id', sub.user_id)

      sent++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      // 404/410 = subscription expired or revoked — clean up so we stop attempting
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('user_id', sub.user_id)
        await supabase
          .from('user_profiles')
          .update({ push_notifications_enabled: false })
          .eq('id', sub.user_id)
      } else {
        console.error('[Push] Send error for user:', sub.user_id, err)
      }
    }
  }

  console.log(`[Push] Sent ${sent} notifications`)
  return NextResponse.json({ ok: true, sent })
}
