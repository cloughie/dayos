import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trackEvent, eventFiredToday, type AnalyticsEventType } from '@/lib/analytics'

const VALID_EVENTS: AnalyticsEventType[] = [
  'daily_checkin_started',
  'plan_saved',
  'plan_updated',
  'returned_same_day',
]

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { event_type } = await request.json()
    if (!VALID_EVENTS.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
    }

    // Deduplicate returned_same_day: only fire once per user per day,
    // and only if a daily_checkin_started already exists today.
    if (event_type === 'returned_same_day') {
      const alreadyReturned = await eventFiredToday(user.id, 'returned_same_day')
      if (alreadyReturned) return NextResponse.json({ ok: true, skipped: true })

      const hasCheckinToday = await eventFiredToday(user.id, 'daily_checkin_started')
      if (!hasCheckinToday) return NextResponse.json({ ok: true, skipped: true })
    }

    // Deduplicate daily_checkin_started: only fire once per user per day.
    if (event_type === 'daily_checkin_started') {
      const alreadyFired = await eventFiredToday(user.id, 'daily_checkin_started')
      if (alreadyFired) return NextResponse.json({ ok: true, skipped: true })
    }

    await trackEvent(user.id, event_type)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Analytics] Route error:', err)
    // Silently succeed — never break the user experience
    return NextResponse.json({ ok: true })
  }
}
