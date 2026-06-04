import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TITLE_MAX = 60
const BODY_MAX = 140

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // createClient() reads the Supabase session cookie — cannot be spoofed from
  // the client. We then re-verify is_admin from the DB, same as the middleware.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('user_profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { dry_run, title: rawTitle, body: rawBody, url: rawUrl } = body as Record<string, unknown>

  const title = typeof rawTitle === 'string' ? rawTitle.trim() : ''
  const msgBody = typeof rawBody === 'string' ? rawBody.trim() : ''
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '/conversation'

  // ── Validation ────────────────────────────────────────────────────────────
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  if (!msgBody) return NextResponse.json({ error: 'Body is required' }, { status: 400 })
  if (title.length > TITLE_MAX) return NextResponse.json({ error: `Title must be ${TITLE_MAX} characters or fewer` }, { status: 400 })
  if (msgBody.length > BODY_MAX) return NextResponse.json({ error: `Body must be ${BODY_MAX} characters or fewer` }, { status: 400 })
  if (!url.startsWith('/')) return NextResponse.json({ error: 'URL must be a relative path starting with /' }, { status: 400 })

  const message = { title, body: msgBody, url }

  // ── VAPID ─────────────────────────────────────────────────────────────────
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  // ── Recipients ────────────────────────────────────────────────────────────
  const admin = createAdminClient()

  const { data: enabledProfiles } = await admin
    .from('user_profiles')
    .select('id')
    .eq('push_notifications_enabled', true)
    .eq('push_notifications_permission_status', 'granted')

  if (!enabledProfiles?.length) {
    return NextResponse.json({ dryRun: !!dry_run, total: 0, sent: 0, failed: 0, expired: 0 })
  }

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', enabledProfiles.map((p) => p.id))

  const total = subscriptions?.length ?? 0

  if (!total || dry_run) {
    return NextResponse.json({ dryRun: true, total, sent: 0, failed: 0, expired: 0 })
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  let sent = 0
  let failed = 0
  let expired = 0

  for (const sub of subscriptions!) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
      )
      sent++
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        // Expired/unregistered — clean up same as daily cron
        expired++
        await admin.from('push_subscriptions').delete().eq('user_id', sub.user_id)
        await admin.from('user_profiles')
          .update({ push_notifications_enabled: false }).eq('id', sub.user_id)
      } else {
        failed++
        console.error('[AdminBroadcast] Send error for user:', sub.user_id, err)
      }
    }
  }

  console.log(`[AdminBroadcast] total=${total} sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ dryRun: false, total, sent, failed, expired })
}
