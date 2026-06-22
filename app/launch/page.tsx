import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Native app entry point (Capacitor server.url points here).
 * Logged-in  → /conversation
 * Logged-out → /auth/login
 *
 * The web/PWA start_url remains "/" (see public/manifest.json).
 * This page is intentionally invisible — it only redirects.
 */
export default async function LaunchPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/conversation')
  } else {
    redirect('/auth/login')
  }
}
