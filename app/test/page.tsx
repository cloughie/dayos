import Link from 'next/link'
import Image from 'next/image'

export default function TestLandingPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

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
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center bg-white text-zinc-950 rounded-xl px-6 py-3.5 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors w-full sm:w-auto sm:self-start"
            >
              Start Your First Check-In
            </Link>
            <p className="text-xs text-zinc-600 sm:pl-0.5">
              Free to use. Best used in the morning. Works great saved to your home screen.
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
