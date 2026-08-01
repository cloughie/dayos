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
              'Conversation messages are transmitted to Anthropic, PBC (Claude) to generate responses — DayOS does not store them after the session ends',
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
              { name: 'Anthropic, PBC (Claude)', role: 'Anthropic\'s Claude AI service processes your check-in messages to generate responses. See "How AI works in DayOS" below for the full list of what is transmitted and why.' },
              { name: 'Apple Push Notification Service', role: 'Delivery of your daily reminder notification.' },
            ].map(({ name, role }) => (
              <div key={name} className="px-4 py-3.5">
                <p className="text-sm font-medium text-zinc-200 mb-0.5">{name}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{role}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How AI works in DayOS */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">How AI works in DayOS</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">Who receives your data</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                DayOS uses the Claude AI service, provided by <span className="text-zinc-300">Anthropic, PBC</span> (anthropic.com). When you send a message, information is transmitted to Anthropic&apos;s servers to generate a response. DayOS does not use any other AI provider for conversation generation.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">What is transmitted</p>
              <p className="text-sm text-zinc-400 leading-relaxed mb-2">The following information is sent to Anthropic during a check-in:</p>
              <ul className="space-y-1">
                {[
                  'Your messages and the AI\'s replies from the current conversation (up to 20 recent turns)',
                  'Your preferred name, if you have set one',
                  'Short summaries you have saved as memories, so responses can be personalised',
                  'Images or documents you choose to attach (binary content only — the filename is never transmitted)',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="text-zinc-600 mt-px shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <p className="text-sm text-zinc-400">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">What is not transmitted</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Your email address, account identifier, push notification token, and device information are never sent to Anthropic.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">Storage by DayOS</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                DayOS does not store the content of your conversations after your session ends. Your preferred name and memories are stored in DayOS&apos;s own encrypted database and are only transmitted to Anthropic to generate responses.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">Your consent</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Before any information is sent to Anthropic, DayOS shows a disclosure screen listing exactly what is transmitted and asks for your permission. Nothing is sent until you tap Allow. If you decline, AI features are unavailable and no data is transmitted. You can review this consent at any time using the &ldquo;Review and Allow&rdquo; option shown when AI features are off.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium text-zinc-200 mb-1">Anthropic&apos;s privacy policy</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Data transmitted to Anthropic is handled under Anthropic&apos;s own privacy policy and terms of service. You can review these at{' '}
                <a href="https://www.anthropic.com/privacy" className="text-zinc-300 underline underline-offset-2">anthropic.com/privacy</a>.
              </p>
            </div>
          </div>
        </div>

        {/* Account and data deletion */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Account and data deletion</h2>
          <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-300 leading-relaxed">
                You can delete individual memories and plans at any time from within the app.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-300 leading-relaxed mb-2">
                To permanently delete your account and all associated DayOS data, go to:
              </p>
              <p className="text-sm font-medium text-zinc-200 mb-2">Settings → Delete account</p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                The app shows a confirmation before deletion. Once confirmed, the account and associated data are permanently deleted, you are signed out, and returned to the authentication screen.
              </p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="mb-2">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Contact</h2>
          <div className="bg-zinc-900 rounded-2xl">
            <div className="px-4 py-3.5">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Questions about privacy can be sent to{' '}
                <a href="mailto:cloughie@gmail.com" className="text-zinc-300 underline underline-offset-2">cloughie@gmail.com</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
