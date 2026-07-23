import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

const APP_STORE_APP_ID = '6788535707'
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_APP_ID}`

export const metadata: Metadata = {
  other: {
    'apple-itunes-app': `app-id=${APP_STORE_APP_ID}, app-argument=https://trydayos.com/`,
  },
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware handles this too, but belt-and-suspenders: no flicker for returning users
  if (user) {
    redirect('/conversation')
  }

  // Native app (WKWebView) appends "DayOS-Native" to its User-Agent.
  // Logged-out native users should land on signup (existing users have a Sign in link there).
  const headersList = await headers()
  const ua = headersList.get('user-agent') ?? ''
  if (ua.includes('DayOS-Native')) {
    redirect('/auth/signup')
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-16 items-center">

        {/* Left: Text content */}
        <div className="flex flex-col gap-6 lg:gap-7">

          {/* Brand */}
          <div>
            <span className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">DayOS</span>
          </div>

          {/* Headline */}
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1]">
              Think more clearly.<br />
              Act more intentionally.
            </h1>
          </div>

          {/* Supporting line */}
          <p className="text-base text-zinc-400 font-medium">
            A daily thinking system for clarity and action.
          </p>

          {/* Body copy */}
          <p className="text-sm text-zinc-400 leading-relaxed max-w-md">
            DayOS helps you slow down, think clearly, understand what actually matters, and turn
            that into focused action.
            <br /><br />
            Through a simple guided daily check-in, it helps you build clarity, self-awareness,
            and better execution.
          </p>

          {/* Value flow */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium tracking-wide">
            <span className="text-zinc-300">Check in</span>
            <span className="text-zinc-700">→</span>
            <span className="text-zinc-300">Think clearly</span>
            <span className="text-zinc-700">→</span>
            <span className="text-zinc-300">Shape your day</span>
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {/* Primary: iOS App Store */}
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-white text-zinc-950 rounded-xl px-6 py-3.5 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 w-full sm:w-auto"
              >
                Download for iOS
              </a>

              {/* Secondary: Web */}
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center border border-zinc-700 text-white rounded-xl px-6 py-3.5 font-semibold text-sm hover:border-zinc-500 hover:bg-zinc-900 active:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 w-full sm:w-auto"
              >
                Continue on Web
              </Link>
            </div>
            <p className="text-xs text-zinc-500 sm:pl-0.5">
              Available on iPhone, or continue instantly in your browser.
            </p>
          </div>
        </div>

        {/* Right: Real product screenshot */}
        <div className="flex items-center justify-center lg:justify-end">
          <Image
            src="/images/dayosscreenshot.png"
            alt="DayOS morning check-in"
            width={340}
            height={680}
            priority
            className="w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[340px] h-auto drop-shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
          />
        </div>

      </div>
    </div>
  )
}
