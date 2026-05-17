import Link from 'next/link'

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
          <p className="text-sm text-zinc-500 leading-relaxed max-w-md">
            DayOS helps you slow down, clear mental noise, understand what actually matters,
            and turn that into focused action. Through a simple guided daily check-in, it helps
            you build clarity, self-awareness, and better execution — one day at a time.
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

        {/* Right: Screenshot / product visual */}
        <div className="relative w-full aspect-[9/16] max-h-[520px] lg:max-h-none rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">

          {/* Simulated app chrome */}
          <div className="px-5 pt-5 pb-3 border-b border-zinc-800/60">
            <p className="text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">DayOS</p>
          </div>

          <div className="flex-1 flex flex-col justify-center px-5 py-6 gap-5">
            {/* Simulated check-in prompt */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">Morning check-in</p>
              <p className="text-sm text-zinc-200 leading-snug font-medium">
                What&apos;s taking up the most space in your head right now?
              </p>
            </div>

            {/* Simulated response bubble */}
            <div className="bg-zinc-800/60 rounded-xl px-4 py-3 self-end max-w-[80%]">
              <p className="text-xs text-zinc-300 leading-relaxed">
                Honestly, the project deadline. I keep avoiding it but it&apos;s sitting heavy.
              </p>
            </div>

            {/* Simulated AI follow-up */}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-zinc-200 leading-snug font-medium">
                That avoidance often points to something underneath — fear, unclear next step, or overwhelm.
                Which feels closest?
              </p>
            </div>

            {/* Simulated response bubble */}
            <div className="bg-zinc-800/60 rounded-xl px-4 py-3 self-end max-w-[80%]">
              <p className="text-xs text-zinc-300 leading-relaxed">
                Unclear next step for sure.
              </p>
            </div>

            {/* Simulated insight */}
            <div className="mt-auto bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">Today&apos;s focus</p>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Define the single clearest next step on the project before noon.
              </p>
            </div>
          </div>

          {/* Bottom input bar */}
          <div className="px-4 pb-4 pt-2 border-t border-zinc-800/60">
            <div className="bg-zinc-800/50 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <div className="flex-1 h-3 bg-zinc-700/50 rounded-full" />
              <div className="w-5 h-5 rounded-full bg-zinc-700/50 shrink-0" />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
