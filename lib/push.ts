function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)
  return buffer
}

// Registers a Web Push subscription via the browser's PushManager.
// Returns the subscription, or null with a console.error explaining why.
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined') return null

  if (!('serviceWorker' in navigator)) {
    console.error('[Push] Service workers not supported in this browser')
    return null
  }
  if (!('PushManager' in window)) {
    console.error('[Push] PushManager not available — push not supported in this context (iOS requires home screen PWA)')
    return null
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — cannot subscribe')
    return null
  }

  try {
    const reg = await navigator.serviceWorker.ready
    console.log('[Push] Service worker ready, scope:', reg.scope)

    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      console.log('[Push] Returning existing push subscription')
      return existing
    }

    console.log('[Push] Creating new push subscription...')
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    })
    console.log('[Push] Subscription created:', subscription.endpoint)
    return subscription
  } catch (err) {
    console.error('[Push] Failed to create push subscription:', err)
    return null
  }
}

// POSTs the PushSubscription to the server for storage.
export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    console.error('[Push] Subscription missing endpoint or keys — cannot save', json)
    return
  }

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('[Push] /api/push/subscribe responded with error:', res.status, text)
    } else {
      console.log('[Push] Subscription saved to server')
    }
  } catch (err) {
    console.error('[Push] Failed to POST subscription to server:', err)
  }
}
