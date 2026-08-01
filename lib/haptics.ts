// Haptic feedback utility — wraps @capacitor/haptics for native iOS.
// All functions are fire-and-forget (return void, never throw) and are safe
// to call on web where they become no-ops. Callers do not need to await them.
//
// Usage:
//   import { hapticLight, hapticMedium, hapticSuccess, hapticWarning } from '@/lib/haptics'
//   hapticLight()   // UIImpactFeedbackGenerator(.light)
//   hapticMedium()  // UIImpactFeedbackGenerator(.medium)
//   hapticSuccess() // UINotificationFeedbackGenerator(.success)
//   hapticWarning() // UINotificationFeedbackGenerator(.warning)

import { Capacitor } from '@capacitor/core'

function impact(style: 'Light' | 'Medium' | 'Heavy'): void {
  if (!Capacitor.isNativePlatform()) return
  import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle[style] }))
    .catch(() => {})
}

function notification(type: 'Success' | 'Warning' | 'Error'): void {
  if (!Capacitor.isNativePlatform()) return
  import('@capacitor/haptics')
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType[type] }))
    .catch(() => {})
}

export const hapticLight   = (): void => impact('Light')
export const hapticMedium  = (): void => impact('Medium')
export const hapticSuccess = (): void => notification('Success')
export const hapticWarning = (): void => notification('Warning')
