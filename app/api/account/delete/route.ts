import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// DELETE /api/account/delete
// Permanently deletes all user data and the auth account.
// Must use the service-role admin client to delete the auth user — the
// anon/user-scoped client cannot do this.
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = user.id
    const admin = createAdminClient()

    // Delete all user-owned data. Order matters: delete child rows before
    // user_profiles (which other tables reference via FK where applicable).
    const tables = [
      'plans',
      'analytics_events',
      'user_memories',
      'push_devices',
    ] as const

    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq('user_id', userId)
      if (error) {
        console.error(`[DeleteAccount] Failed to delete from ${table}:`, error)
        return NextResponse.json({ error: `Failed to delete ${table}` }, { status: 500 })
      }
    }

    // user_profiles uses `id` as PK (= auth user id)
    const { error: profileError } = await admin
      .from('user_profiles')
      .delete()
      .eq('id', userId)
    if (profileError) {
      console.error('[DeleteAccount] Failed to delete user_profiles:', profileError)
      return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 })
    }

    // Delete the Supabase Auth user — requires service role key
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('[DeleteAccount] Failed to delete auth user:', authError)
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DeleteAccount] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
