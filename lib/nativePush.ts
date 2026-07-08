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
  console.log('[NativePush] Requesting permission...')
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const result = await PushNotifications.requestPermissions()
  console.log('[NativePush] Permission result:', result.receive)
  return result.receive === 'granted' ? 'granted' : 'denied'
}

// Registers with APNs and returns the device token, or null on failure.
// addListener() is async in Capacitor 4+ — we must await both listeners before
// calling register(), otherwise the registration event can arrive before the
// listener is wired up on the native bridge and we silently miss it.
export async function registerForNativePush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  console.log('[NativePush] Loading PushNotifications plugin...')
  const { PushNotifications } = await import('@capacitor/push-notifications')

  await PushNotifications.removeAllListeners()
  console.log('[NativePush] Removed existing listeners')

  return new Promise<string | null>((resolve) => {
    Promise.all([
      PushNotifications.addListener('registration', (token) => {
        console.log('[NativePush] APNs token received:', token.value)
        resolve(token.value)
      }),
      PushNotifications.addListener('registrationError', (err) => {
        console.error('[NativePush] Registration error:', JSON.stringify(err))
        resolve(null)
      }),
    ]).then(() => {
      console.log('[NativePush] Listeners registered, calling register()...')
      PushNotifications.register()
    }).catch((err) => {
      console.error('[NativePush] Failed to register listeners:', err)
      resolve(null)
    })
  })
}
