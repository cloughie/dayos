import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // If the user has a recovery_sent_at timestamp, this is a password reset flow.
      // We detect it here rather than relying on a ?next= param in the redirectTo URL,
      // because Supabase matches redirect URLs literally and query params break the match.
      const isRecovery = !!data.user?.recovery_sent_at
      const destination = isRecovery ? '/auth/reset-password' : next

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${destination}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`)
      } else {
        return NextResponse.redirect(`${origin}${destination}`)
      }
    }

    // Code was invalid or expired — send to forgot-password with a clear error
    return NextResponse.redirect(
      `${origin}/auth/forgot-password?error=link_expired`
    )
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}
