import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendApnsNotification } from '@/lib/apns'

// Each template has a generic title/body and optional named variants.
// namedTitle / namedBody use {name} as a placeholder.
// Templates with no named variants are sent as-is regardless of whether a name is available.
type MessageTemplate = {
  title: string
  namedTitle?: string
  body: string
  namedBody?: string
}

const MESSAGES: MessageTemplate[] = [
  // Name in title
  { title: 'Morning check-in?',        namedTitle: 'Morning, {name}',             body: 'Five minutes to get clear on what matters today.' },
  // Name in body
  { title: 'Time to check in',                                                     body: 'A quick reset before the day gets away from you.',       namedBody: 'A quick reset before the day gets away from you, {name}.' },
  // Name in title
  { title: 'What matters today?',      namedTitle: 'What matters today, {name}?', body: 'Take a few minutes to clear your head and set direction.' },
  // Fully generic
  { title: 'Before the day gets busy',                                             body: 'Pause for five minutes and think clearly about today.' },
  // Name in body
  { title: 'Take five minutes',                                                    body: 'Clear your head and focus on what matters today.',        namedBody: 'Clear your head and focus on what matters, {name}.' },
  // Fully generic
  { title: 'Get clear for today',                                                  body: 'A small check-in now can help shape the day.' },
  // Name in body
  { title: 'Morning check-in?',                                                    body: 'Start with a little more clarity and intention.',         namedBody: 'Start with a little more clarity and intention, {name}.' },
  // Fully generic
  { title: "What's the focus today?",                                              body: 'A quick check-in before the day takes over.' },
]

function resolveMessage(template: MessageTemplate, name: string | null): { title: string; body: string } {
  const n = name?.trim() || null
  const title = n && template.namedTitle ? template.namedTitle.replace('{name}', n) : template.title
  const body  = n && template.namedBody  ? template.namedBody.replace('{name}', n)  : template.body
  return { title, body }
}

function pickMessage(lastTitle: string | null, name: string | null): { title: string; body: string } {
  const resolved = MESSAGES.map((t) => resolveMessage(t, name))
  const pool = lastTitle ? resolved.filter((m) => m.title !== lastTitle) : resolved
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

  // ── Step 1: eligible users ────────────────────────────────────────────────
  const { data: enabledProfiles } = await supabase
    .from('user_profiles')
    .select('id, preferred_name')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) return NextResponse.json({ ok: true, sent: 0 })

  // Build a lookup so the device loop can resolve names without extra queries.
  // Values are trimmed strings or null — never logged.
  const nameByUserId = new Map<string, string | null>(
    enabledProfiles.map((p) => [p.id, p.preferred_name?.trim() || null]),
  )

  // ── Step 2: filter out users who already checked in today ─────────────────
  // One analytics query per user, done up-front so devices for the same user
  // don't each trigger a separate DB round-trip.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recentCheckIns } = await supabase
    .from('analytics_events')
    .select('user_id, created_at')
    .in('user_id', enabledProfiles.map((p) => p.id))
    .eq('event_type', 'daily_checkin_started')
    .gte('created_at', since24h)

  const checkedInToday = new Set(
    (recentCheckIns ?? [])
      .filter((e) => new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today)
      .map((e) => e.user_id),
  )

  const eligibleUserIds = enabledProfiles
    .map((p) => p.id)
    .filter((id) => !checkedInToday.has(id))

  if (!eligibleUserIds.length) return NextResponse.json({ ok: true, sent: 0 })

  // ── Step 3: fetch all push devices for eligible users ─────────────────────
  const { data: devices } = await supabase
    .from('push_devices')
    .select('id, user_id, platform, endpoint, p256dh, auth, apns_token, last_notification_body, last_sent_at')
    .in('user_id', eligibleUserIds)

  if (!devices?.length) return NextResponse.json({ ok: true, sent: 0 })

  // ── Step 4: send, dispatch by platform ───────────────────────────────────
  const counts = { web: { attempted: 0, sent: 0, failed: 0 }, ios: { attempted: 0, sent: 0, failed: 0 } }

  for (const dev of devices) {
    try {
      // Skip this device if we already sent to it today
      if (dev.last_sent_at) {
        const lastSentDay = new Date(dev.last_sent_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
        if (lastSentDay === today) continue
      }

      const message = pickMessage(dev.last_notification_body, nameByUserId.get(dev.user_id) ?? null)

      if (dev.platform === 'web') {
        // ── Web Push ──────────────────────────────────────────────────────
        if (!dev.endpoint || !dev.p256dh || !dev.auth) continue

        counts.web.attempted++
        await webpush.sendNotification(
          { endpoint: dev.endpoint, keys: { p256dh: dev.p256dh, auth: dev.auth } },
          JSON.stringify({ title: message.title, body: message.body, url: '/conversation' }),
        )
      } else if (dev.platform === 'ios') {
        // ── APNs ──────────────────────────────────────────────────────────
        if (!dev.apns_token) continue

        counts.ios.attempted++
        const result = await sendApnsNotification(dev.apns_token, message.title, message.body)

        if (result === 'expired') {
          counts.ios.failed++
          // Token is no longer valid — clean up the device row
          await supabase.from('push_devices').delete().eq('id', dev.id)
          const { count } = await supabase
            .from('push_devices')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', dev.user_id)
          if ((count ?? 0) === 0) {
            await supabase.from('user_profiles')
              .update({ push_notifications_enabled: false })
              .eq('id', dev.user_id)
          }
          continue
        }

        if (result === 'error') {
          counts.ios.failed++
          continue
        }
      } else {
        continue
      }

      // ── Update dedup fields on success ───────────────────────────────────
      await supabase
        .from('push_devices')
        .update({
          last_notification_body: message.title,
          last_sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', dev.id)

      if (dev.platform === 'web') counts.web.sent++
      else counts.ios.sent++
    } catch (err: unknown) {
      // Web Push throws on failure; catch 404/410 (expired subscription)
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await supabase.from('push_devices').delete().eq('id', dev.id)
        const { count } = await supabase
          .from('push_devices')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', dev.user_id)
        if ((count ?? 0) === 0) {
          await supabase.from('user_profiles')
            .update({ push_notifications_enabled: false })
            .eq('id', dev.user_id)
        }
        counts.web.failed++
      } else {
        console.error('[Push] Send error for device:', dev.id, 'user:', dev.user_id, err)
        counts.web.failed++
      }
    }
  }

  const sent = counts.web.sent + counts.ios.sent
  console.log(
    `[Push] web: ${counts.web.attempted} attempted, ${counts.web.sent} sent, ${counts.web.failed} failed` +
    ` | ios: ${counts.ios.attempted} attempted, ${counts.ios.sent} sent, ${counts.ios.failed} failed` +
    ` | total sent: ${sent}`,
  )
  return NextResponse.json({ ok: true, sent, counts })
}
