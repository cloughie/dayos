'use client'

// Mon–Sun labels (index 0 = Monday)
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Returns the 7 YYYY-MM-DD strings for Mon–Sun of the current local week.
export function getLocalWeekDays(tz: string): string[] {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const todayDate = new Date(todayStr) // UTC midnight of the local date
  const dow = todayDate.getUTCDay() // 0=Sun … 6=Sat
  const offsetToMonday = dow === 0 ? -6 : 1 - dow

  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayDate)
    d.setUTCDate(todayDate.getUTCDate() + offsetToMonday + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

interface StreakBarProps {
  weekDays: string[]   // 7 YYYY-MM-DD strings, Mon–Sun
  today: string        // YYYY-MM-DD local today
  checkedInDays: string[]
  streak: number
}

export default function StreakBar({ weekDays, today, checkedInDays, streak }: StreakBarProps) {
  const checkedSet = new Set(checkedInDays)

  return (
    <div className="-mx-4 flex items-end justify-center gap-6 px-4 pt-[9px] pb-[25px] mb-[25px] border-b border-[color:var(--divider)]">
      {/* Weekly dots */}
      <div className="flex items-center gap-6">
        {weekDays.map((day, i) => {
          const isToday = day === today
          const isChecked = checkedSet.has(day)
          const isFuture = day > today

          let dotClass = ''
          if (isChecked) {
            dotClass = 'bg-[var(--dot-filled)]'
          } else if (isFuture) {
            dotClass = 'bg-[var(--dot-empty)]'
          } else if (isToday) {
            dotClass = 'bg-zinc-500 ring-1 ring-zinc-400'
          } else {
            dotClass = 'bg-[var(--dot-empty)]'
          }

          return (
            <div key={day} className="flex flex-col items-center gap-1.5">
              {/* Small indicator dot above the label — only on today */}
              <div className={`w-1 h-1 rounded-full ${isToday ? 'bg-zinc-400' : 'bg-transparent'}`} />
              <span
                className={`text-[10px] tracking-wide leading-none ${
                  isToday
                    ? 'font-bold text-zinc-300'
                    : 'font-medium text-zinc-600'
                }`}
              >
                {DAY_LABELS[i]}
              </span>
              <div className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
            </div>
          )
        })}
      </div>

      {/* Streak count — right of dots, visible only when > 0 */}
      {streak > 0 && (
        <span className="flex items-center gap-1 text-zinc-400 select-none">
          <span className="text-[11px]">⚡</span>
          <span className="text-sm font-semibold tabular-nums">{streak}</span>
        </span>
      )}
    </div>
  )
}
