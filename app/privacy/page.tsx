'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col px-6 py-6 safe-top safe-bottom">
      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-10 self-start"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span className="text-sm">Back</span>
      </button>

      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-2xl font-semibold text-white mb-3">Your privacy matters</h1>
        <p className="text-zinc-400 text-sm leading-relaxed mb-10">
          DayOS is designed for personal reflection. Your thoughts and check-ins are private.
        </p>

        <div className="mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What&apos;s private</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            {[
              'Your conversations are only visible to you',
              'Saved memories are securely stored',
              'Your data is protected',
              'You control your saved memories and can delete them at any time',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 px-4 py-3.5">
                <span className="text-zinc-500 mt-px shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-sm text-zinc-300 leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
