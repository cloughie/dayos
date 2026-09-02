import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendApnsNotification } from '@/lib/apns'

const TITLE_MAX = 60
const BODY_MAX = 140

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // ── Devices (all platforms) ───────────────────────────────────────────────
  const { data: devices } = await admin
    .from('push_devices')
    .select('id, user_id, platform, endpoint, p256dh, auth, apns_token')
    .in('user_id', enabledProfiles.map((p) => p.id))

  const total = devices?.length ?? 0

  if (!total || dry_run) {
    return NextResponse.json({ dryRun: true, total, sent: 0, failed: 0, expired: 0 })
  }

  // ── Log broadcast row ─────────────────────────────────────────────────────
  const { data: broadcastRecord } = await admin
    .from('push_broadcasts')
    .insert({
      title,
      body: msgBody,
      destination_path: url,
      total_recipients: total,
      sent_by_user_id: user.id,
    })
    .select('id')
    .single()

  const broadcastId = broadcastRecord?.id as string | undefined

  const notifUrl = broadcastId
    ? `${url}${url.includes('?') ? '&' : '?'}source=push_broadcast&broadcast_id=${broadcastId}`
    : url

  const message = { title, body: msgBody, url: notifUrl }

  // ── Send (dispatch by platform, mirroring push/send/route.ts) ────────────
  let sent = 0
  let failed = 0
  let expired = 0

  for (const dev of devices!) {
    try {
      if (dev.platform === 'web') {
        if (!dev.endpoint || !dev.p256dh || !dev.auth) continue

        await webpush.sendNotification(
          { endpoint: dev.endpoint, keys: { p256dh: dev.p256dh, auth: dev.auth } },
          JSON.stringify(message),
        )
        sent++
      } else if (dev.platform === 'ios') {
        if (!dev.apns_token) continue

        const result = await sendApnsNotification(dev.apns_token, title, msgBody)

        if (result === 'sent') {
          sent++
        } else if (result === 'expired') {
          expired++
          await admin.from('push_devices').delete().eq('id', dev.id)
          const { count } = await admin
            .from('push_devices')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', dev.user_id)
          if ((count ?? 0) === 0) {
            await admin.from('user_profiles')
              .update({ push_notifications_enabled: false })
              .eq('id', dev.user_id)
          }
        } else {
          failed++
          console.error('[AdminBroadcast] APNs error for user:', dev.user_id)
        }
      }
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 400 || status === 404 || status === 410) {
        expired++
        await admin.from('push_devices').delete().eq('id', dev.id)
        const { count } = await admin
          .from('push_devices')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', dev.user_id)
        if ((count ?? 0) === 0) {
          await admin.from('user_profiles')
            .update({ push_notifications_enabled: false })
            .eq('id', dev.user_id)
        }
      } else {
        failed++
        console.error('[AdminBroadcast] Send error for user:', dev.user_id, err)
      }
    }
  }

  if (broadcastId) {
    await admin
      .from('push_broadcasts')
      .update({ sent_count: sent, failed_count: failed, expired_count: expired })
      .eq('id', broadcastId)
  }

  console.log(`[AdminBroadcast] total=${total} sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ dryRun: false, total, sent, failed, expired })
}
