// Thin wrapper around @capacitor/push-notifications for use in the Next.js web layer.
// All functions are safe to import on web — they check isNativePlatform() and no-op there.

import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

// Requests permission to send push notifications via the native iOS system dialog.
// Returns 'granted' or 'denied'.
export async function requestNativePermission(): Promise<'granted' | 'denied'> {
  if (!Capacitor.isNativePlatform()) return 'denied'
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const result = await PushNotifications.requestPermissions()
  return result.receive === 'granted' ? 'granted' : 'denied'
}

// Registers with APNs and returns the device token, or null on failure.
// Removes any existing listeners before registering to prevent duplicates on repeated calls.
export async function registerForNativePush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  const { PushNotifications } = await import('@capacitor/push-notifications')

  await PushNotifications.removeAllListeners()

  return new Promise<string | null>((resolve) => {
    PushNotifications.addListener('registration', (token) => {
      resolve(token.value)
    })
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[NativePush] Registration error:', err)
      resolve(null)
    })
    PushNotifications.register()
  })
}
