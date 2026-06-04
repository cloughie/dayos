import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Subtract N days from a YYYY-MM-DD string (treated as UTC midnight).
function subtractDays(dateStr: string, n = 1): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    // tz must be a valid IANA timezone string e.g. "America/New_York"
    const tz = searchParams.get('tz') || 'UTC'

    // Fetch all daily_checkin_started events — we only need the timestamp.
    // Limit to 90 days to cap query size (no streak can be longer than 90 without data).
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
    const { data: events } = await supabase
      .from('analytics_events')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'daily_checkin_started')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    if (!events || events.length === 0) {
      return NextResponse.json({ streak: 0, checkedInDays: [] })
    }

    // Convert each timestamp to the user's local calendar date (YYYY-MM-DD).
    const toLocalDate = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

    // Deduplicate by local date, keep sorted descending.
    const uniqueDays = [...new Set(events.map(e => toLocalDate(e.created_at)))]
    uniqueDays.sort((a, b) => b.localeCompare(a))

    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const yesterday = subtractDays(today)

    // Streak counts consecutive days ending at today or yesterday.
    // (If the user hasn't started today's check-in yet, yesterday keeps the streak alive.)
    let streak = 0
    if (uniqueDays.length > 0 && (uniqueDays[0] === today || uniqueDays[0] === yesterday)) {
      let expected = uniqueDays[0]
      for (const day of uniqueDays) {
        if (day === expected) {
          streak++
          expected = subtractDays(expected)
        } else {
          break // gap found
        }
      }
    }

    // Return the last 14 days of check-in dates for the weekly strip.
    return NextResponse.json({ streak, checkedInDays: uniqueDays.slice(0, 14) })
  } catch (err) {
    console.error('[Streak] Error:', err)
    return NextResponse.json({ streak: 0, checkedInDays: [] })
  }
}
