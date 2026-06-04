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
}

export default function StreakBar({ weekDays, today, checkedInDays }: StreakBarProps) {
  const checkedSet = new Set(checkedInDays)

  return (
    <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-zinc-900">
      {weekDays.map((day, i) => {
        const isToday = day === today
        const isChecked = checkedSet.has(day)
        const isFuture = day > today

        let dotClass = ''
        if (isChecked) {
          dotClass = 'bg-zinc-300'
        } else if (isFuture) {
          dotClass = 'bg-zinc-800'
        } else if (isToday) {
          // Today not yet checked in — subtle ring to draw attention without alarm
          dotClass = 'bg-zinc-900 ring-1 ring-zinc-600'
        } else {
          // Past day, missed
          dotClass = 'bg-zinc-800'
        }

        return (
          <div key={day} className="flex flex-col items-center gap-1.5">
            <span
              className={`text-[9px] font-medium tracking-wide leading-none ${
                isToday ? 'text-zinc-400' : 'text-zinc-700'
              }`}
            >
              {DAY_LABELS[i]}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          </div>
        )
      })}
    </div>
  )
}
