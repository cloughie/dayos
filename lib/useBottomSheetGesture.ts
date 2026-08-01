import { useEffect, useRef, useState } from 'react'
import { hapticMedium } from '@/lib/haptics'

/**
 * Swipe-to-dismiss gesture for bottom-sheet panels.
 *
 * Behaviour:
 * - 8 px dead zone before committing to drag or scroll mode.
 * - Only enters drag mode on a downward swipe when scrollRef is at the top (scrollTop === 0).
 *   Upward swipes or swipes while the inner content is scrolled always pass through as scroll.
 * - Dismiss threshold: deltaY > 120 px OR velocity > 0.5 px/ms.
 * - Fires hapticMedium exactly once per gesture at the dismiss threshold.
 * - Short drags snap back with a spring transition; dismissed sheets animate off-screen first.
 *
 * @param sheetRef  Ref on the outermost panel div — touch listeners attach here.
 * @param scrollRef Ref on the inner scrollable div — used to read scrollTop.
 * @param isOpen    Listeners are only attached while the sheet is open.
 * @param onClose   Called after the 300 ms dismiss animation completes.
 */
export function useBottomSheetGesture(
  sheetRef: { readonly current: HTMLElement | null },
  scrollRef: { readonly current: HTMLElement | null },
  isOpen: boolean,
  onClose: () => void,
): { dragY: number; isDragging: boolean } {
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
        hapticMedium()
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
    // sheetRef and scrollRef are stable React refs — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  return { dragY, isDragging }
}
