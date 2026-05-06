import { createClient } from '@/lib/supabase/server'

export type AnalyticsEventType =
  | 'daily_checkin_started'
  | 'plan_saved'
  | 'plan_updated'
  | 'returned_same_day'

// Server-side fire-and-forget event tracking. Never throws.
export async function trackEvent(
  userId: string,
  eventType: AnalyticsEventType,
  metadata: Record<string, unknown> = {}
) {
  try {
    const supabase = await createClient()
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    })
  } catch (err) {
    console.error('[Analytics] Failed to track event:', eventType, err)
  }
}

// Returns true if an event of this type already exists for the user today (UTC).
export async function eventFiredToday(userId: string, eventType: AnalyticsEventType) {
  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD UTC
    const { count } = await supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .gte('created_at', `${today}T00:00:00Z`)
    return (count ?? 0) > 0
  } catch {
    return false
  }
}
