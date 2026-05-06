import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trackEvent } from '@/lib/analytics'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

    const { data, error } = await supabase
      .from('plans')
      .select('raw_text, date, updated_at')
      .eq('user_id', user.id)
      .eq('date', date)
      .single()

    // PGRST116 = no rows found — not an error
    if (error && error.code !== 'PGRST116') throw error

    if (!data) return NextResponse.json({ plan: null })

    return NextResponse.json({
      plan: {
        content: data.raw_text,
        date: data.date,
        savedAt: data.updated_at,
      },
    })
  } catch (error) {
    console.error('[Plans] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { content, date } = await request.json()
    if (!content || !date) {
      return NextResponse.json({ error: 'content and date required' }, { status: 400 })
    }

    // Check whether a plan already exists to distinguish save vs update
    const { data: existing } = await supabase
      .from('plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', date)
      .single()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('plans')
      .upsert(
        { user_id: user.id, date, raw_text: content, updated_at: now },
        { onConflict: 'user_id,date' }
      )

    if (error) throw error

    // Fire-and-forget analytics — never block the response
    trackEvent(user.id, existing ? 'plan_updated' : 'plan_saved').catch(() => {})

    return NextResponse.json({ ok: true, savedAt: now })
  } catch (error) {
    console.error('[Plans] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
