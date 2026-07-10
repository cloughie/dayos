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
          DayOS is designed for personal reflection. Here&apos;s exactly what we collect and why.
        </p>

        {/* What we store */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What we store</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            {[
              { label: 'Account', detail: 'Your email address and optional preferred name, used to sign in and personalise the app.' },
              { label: 'Plans & memories', detail: 'Your saved daily plans and any memories you store are encrypted and securely stored in our database.' },
              { label: 'Push notification token', detail: 'If you enable notifications, we store your device token and timezone to send your daily reminder.' },
              { label: 'Usage events', detail: 'Basic events like opening the app, starting a check-in, or saving a plan — linked to your account, used to improve the app and understand how features are used.' },
            ].map(({ label, detail }) => (
              <div key={label} className="px-4 py-3.5">
                <p className="text-sm font-medium text-zinc-200 mb-0.5">{label}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* What's private */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What&apos;s private</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            {[
              'Conversations are sent to an AI model to generate responses but are not stored by DayOS after your session ends',
              'Plans and memories are encrypted and securely stored',
              'We never sell your personal information',
              'We don\'t track you across other apps or websites',
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

        {/* Third-party services */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Third-party services</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            {[
              { name: 'Supabase', role: 'Account authentication and encrypted database storage.' },
              { name: 'Anthropic (Claude) / OpenAI', role: 'AI providers that securely process your check-in conversations to generate responses. Conversations are not stored by DayOS.' },
              { name: 'Apple Push Notification Service', role: 'Delivery of your daily reminder notification.' },
            ].map(({ name, role }) => (
              <div key={name} className="px-4 py-3.5">
                <p className="text-sm font-medium text-zinc-200 mb-0.5">{name}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{role}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Deletion & contact */}
        <div className="mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Deletion &amp; contact</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-300 leading-relaxed">
                You can delete individual memories and plans at any time from within the app.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-300 leading-relaxed">
                To delete your account and all associated data, email{' '}
                <a href="mailto:cloughie@gmail.com" className="text-white underline underline-offset-2">cloughie@gmail.com</a>.
                We&apos;ll process your request and delete your account and associated data within 30 days.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Questions about privacy? Reach out at{' '}
                <a href="mailto:cloughie@gmail.com" className="text-zinc-300 underline underline-offset-2">cloughie@gmail.com</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
