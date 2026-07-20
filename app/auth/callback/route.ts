import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type      = searchParams.get('type')
  const code      = searchParams.get('code')
  const next      = searchParams.get('next') ?? '/'

  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv    = process.env.NODE_ENV === 'development'

  function buildRedirect(path: string) {
    if (isLocalEnv)      return NextResponse.redirect(`${origin}${path}`)
    if (forwardedHost)   return NextResponse.redirect(`https://${forwardedHost}${path}`)
    return NextResponse.redirect(`${origin}${path}`)
  }

  // ── Recovery via token_hash ────────────────────────────────────────────────
  // Email template sends the user directly here with ?token_hash=...&type=recovery.
  // verifyOtp does not require a PKCE code verifier, so it works correctly even
  // when the reset was requested inside the iOS app but the link opens in Safari
  // (which has a separate cookie jar and would not have the PKCE verifier).
  if (tokenHash && type === 'recovery') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (!error) return buildRedirect('/auth/reset-password')
    return buildRedirect('/auth/forgot-password?error=link_expired')
  }

  // ── PKCE code exchange (OAuth, magic links, and any other flows) ──────────
  // Recovery emails no longer use this path; kept for all other auth flows.
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Belt-and-suspenders: if a recovery code somehow arrives here, route correctly.
      const destination = data.user?.recovery_sent_at ? '/auth/reset-password' : next
      return buildRedirect(destination)
    }
    return buildRedirect('/auth/forgot-password?error=link_expired')
  }

  return buildRedirect('/auth/login?error=auth_callback_error')
}
