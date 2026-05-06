import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const PROTECTED_ROUTES = ['/', '/conversation', '/onboarding']
const AUTH_ROUTES = ['/auth/login', '/auth/signup']

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const pathname = request.nextUrl.pathname

  // Admin route protection — 404 for anyone who isn't the admin user
  if (pathname.startsWith('/admin')) {
    if (!user || user.id !== process.env.ADMIN_USER_ID) {
      return new NextResponse(null, { status: 404 })
    }
  }

  // Safety net: if a Supabase auth code lands on /auth/login (happens when the
  // Supabase Site URL points here instead of /auth/callback), forward it to the
  // callback handler so the code is exchanged and the user is routed correctly.
  const code = request.nextUrl.searchParams.get('code')
  if (code && pathname === '/auth/login') {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'
    return NextResponse.redirect(callbackUrl)
  }

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  // Unauthenticated user trying to access protected route → redirect to login
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user trying to access auth routes → redirect to home
  if (user && isAuthRoute) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    return NextResponse.redirect(homeUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     * - public folder files
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)',
  ],
}
