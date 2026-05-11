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
        <div className="flex items-center gap-2.5 mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h1 className="text-2xl font-semibold text-white">Your privacy matters</h1>
        </div>
        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
          DayOS is designed for personal reflection.
        </p>
        <p className="text-zinc-400 text-sm leading-relaxed mb-10">
          Your conversations are processed privately and are not stored by DayOS. Saved memories are encrypted and securely stored in our database.
        </p>

        <div className="mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What&apos;s private</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            {[
              'Conversations are not stored by DayOS',
              'Saved memories are encrypted and securely stored in our database',
              'We never sell your personal information',
              'You can review and delete saved memories at any time',
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
