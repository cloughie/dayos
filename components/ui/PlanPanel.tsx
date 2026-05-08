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
  yesterdayPlan?: SavedPlan | null
}

export default function PlanPanel({ isOpen, onClose, plan, yesterdayPlan }: PlanPanelProps) {
  if (!isOpen) return null

  const activePlan = plan ?? yesterdayPlan ?? null
  const isYesterday = !plan && !!yesterdayPlan

  const savedTime = plan
    ? new Date(plan.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const yesterdayDate = isYesterday && yesterdayPlan
    ? new Date(yesterdayPlan.date + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
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
          <h2 className="text-base font-semibold text-white">
            {isYesterday ? 'Yesterday\u2019s Plan' : 'Today\u2019s Plan'}
          </h2>
          {savedTime && (
            <span className="text-xs text-zinc-500">Saved {savedTime}</span>
          )}
          {yesterdayDate && (
            <span className="text-xs text-zinc-500">{yesterdayDate}</span>
          )}
        </div>

        {isYesterday && (
          <p className="text-xs text-zinc-500 mb-4 shrink-0">
            This will be replaced when you save today&apos;s plan.
          </p>
        )}

        <div className="overflow-y-auto flex-1 min-h-0">
          {activePlan ? (
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {activePlan.content}
            </p>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-8">
              This is where your day lives.<br />
              Once your plan is created, you can save it here and return to it anytime.
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
