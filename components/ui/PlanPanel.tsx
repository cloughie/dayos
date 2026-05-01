'use client'

export interface SavedPlan {
  content: string
  date: string
  savedAt: string
}

interface PlanPanelProps {
  isOpen: boolean
  onClose: () => void
  plan: SavedPlan | null
}

export default function PlanPanel({ isOpen, onClose, plan }: PlanPanelProps) {
  if (!isOpen) return null

  const savedTime = plan
    ? new Date(plan.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom max-h-[80vh] flex flex-col">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6 shrink-0" />

        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-base font-semibold text-white">Today&apos;s Plan</h2>
          {savedTime && (
            <span className="text-xs text-zinc-500">Saved {savedTime}</span>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {plan ? (
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {plan.content}
            </p>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-8">
              No plan saved yet.{'\n'}Ask the assistant to create your daily plan, then tap &ldquo;Save as today&apos;s plan&rdquo;.
            </p>
          )}
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
