'use client'

import { useEffect, useRef, useState } from 'react'

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
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet || !isOpen) return

    let startY = 0
    let startTime = 0
    let currentY = 0
    let mode: 'undecided' | 'drag' | 'scroll' = 'undecided'

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startY = touch.clientY
      startTime = Date.now()
      currentY = touch.clientY
      mode = 'undecided'
    }

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      const deltaY = touch.clientY - startY
      currentY = touch.clientY

      if (mode === 'undecided') {
        if (Math.abs(deltaY) < 8) return
        const scrollTop = scrollRef.current?.scrollTop ?? 0
        mode = deltaY > 0 && scrollTop === 0 ? 'drag' : 'scroll'
        if (mode === 'drag') setIsDragging(true)
      }

      if (mode === 'drag') {
        e.preventDefault()
        setDragY(Math.max(0, deltaY))
      }
    }

    const onTouchEnd = () => {
      if (mode !== 'drag') {
        mode = 'undecided'
        return
      }

      const deltaY = currentY - startY
      const elapsed = Date.now() - startTime
      const velocity = elapsed > 0 ? deltaY / elapsed : 0

      setIsDragging(false)
      mode = 'undecided'

      if (deltaY > 120 || velocity > 0.5) {
        setDragY(window.innerHeight)
        setTimeout(() => {
          setDragY(0)
          onCloseRef.current()
        }, 300)
      } else {
        setDragY(0)
      }
    }

    sheet.addEventListener('touchstart', onTouchStart, { passive: true })
    sheet.addEventListener('touchmove', onTouchMove, { passive: false })
    sheet.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      sheet.removeEventListener('touchstart', onTouchStart)
      sheet.removeEventListener('touchmove', onTouchMove)
      sheet.removeEventListener('touchend', onTouchEnd)
    }
  }, [isOpen])

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
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom max-h-[80vh] flex flex-col"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
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

        <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0">
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
