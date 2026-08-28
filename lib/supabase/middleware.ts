import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() reads the JWT from the cookie locally — no network request in the common case.
  // It only hits the network when the access token is within 90 s of expiry to refresh it.
  //
  // We previously called getUser() here, which made a GET /auth/v1/user request to Supabase
  // on every single page load. When Supabase auth latency spiked above Vercel's ~1.5 s edge
  // middleware limit this caused MIDDLEWARE_INVOCATION_TIMEOUT for all users simultaneously.
  //
  // The authoritative getUser() call remains in each protected page server component
  // (app/conversation/page.tsx etc.), which runs in Node.js with a 60 s timeout and is the
  // real security gate. The middleware redirect is a routing convenience only.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  return { supabaseResponse, user }
}
