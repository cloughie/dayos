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

// Today's date string in Europe/London (YYYY-MM-DD)
function londonToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export async function GET(request: Request) {
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
  const today = londonToday()

  const { data: enabledProfiles } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) return NextResponse.json({ ok: true, sent: 0 })

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, last_notification_body, last_sent_at')
    .in('user_id', enabledProfiles.map((p) => p.id))

  if (!subscriptions?.length) return NextResponse.json({ ok: true, sent: 0 })

  let sent = 0

  for (const sub of subscriptions) {
    try {
      // Skip if already sent today
      if (sub.last_sent_at) {
        const lastSentDay = new Date(sub.last_sent_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
        if (lastSentDay === today) continue
      }

      // Skip if user has already started a check-in today
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: events } = await supabase
        .from('analytics_events')
        .select('created_at')
        .eq('user_id', sub.user_id)
        .eq('event_type', 'daily_checkin_started')
        .gte('created_at', since24h)

      const usedToday = (events ?? []).some(
        (e) => new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today,
      )
      if (usedToday) continue

      const body = pickMessage(sub.last_notification_body)

      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ body, url: '/conversation' }),
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
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('user_id', sub.user_id)
        await supabase.from('user_profiles').update({ push_notifications_enabled: false }).eq('id', sub.user_id)
      } else {
        console.error('[Push] Send error for user:', sub.user_id, err)
      }
    }
  }

  console.log(`[Push] Sent ${sent} notifications`)
  return NextResponse.json({ ok: true, sent })
}
