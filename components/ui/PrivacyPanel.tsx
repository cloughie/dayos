'use client'

interface PrivacyPanelProps {
  isOpen: boolean
  onClose: () => void
}

const PRIVACY_ITEMS = [
  'Conversations are not stored by DayOS',
  'Saved memories are encrypted and securely stored in our database',
  'We never sell your personal information',
  'You can review and delete saved memories at any time',
]

export default function PrivacyPanel({ isOpen, onClose }: PrivacyPanelProps) {
  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom max-h-[80vh] flex flex-col">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6 shrink-0" />

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center gap-2.5 mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Your privacy matters</h2>
          </div>

          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
            DayOS is designed for personal reflection.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-3">
            Your conversations are processed privately and are not stored by DayOS.
          </p>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Saved memories are encrypted and securely stored in our database.
          </p>

          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">What&apos;s private</h3>
            <div className="bg-zinc-800/50 rounded-2xl divide-y divide-zinc-800">
              {PRIVACY_ITEMS.map((item) => (
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

        <button
          onClick={onClose}
          className="w-full mt-4 text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors shrink-0"
        >
          Close
        </button>
      </div>
    </>
  )
}
