'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
  onMemoryOpen: () => void
}

type DebugStep = { msg: string; ok: boolean }

export default function SettingsModal({ isOpen, onClose, userEmail, onMemoryOpen }: SettingsModalProps) {
  const router = useRouter()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'default'>('default')
  const [userId, setUserId] = useState<string | null>(null)
  const [debugSteps, setDebugSteps] = useState<DebugStep[]>([])

  function addStep(msg: string, ok: boolean) {
    setDebugSteps(prev => [...prev, { msg, ok }])
  }

  useEffect(() => {
    if (!isOpen) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('user_profiles')
        .select('push_notifications_enabled, push_notifications_permission_status')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) return
          setNotificationsEnabled(data.push_notifications_enabled ?? false)
          setPermStatus((data.push_notifications_permission_status ?? 'default') as 'granted' | 'denied' | 'default')
        })
    })
  }, [isOpen])

  async function handleNotificationToggle(enable: boolean) {
    setDebugSteps([])
    addStep(`1. Toggle tapped — enable=${enable}`, true)

    if (!userId) {
      addStep('2. ✗ userId is null — auth not loaded yet', false)
      return
    }
    addStep(`2. userId loaded (${userId.slice(0, 8)}…)`, true)

    const supabase = createClient()

    // ── Disable path ──
    if (!enable) {
      const res = await fetch('/api/push/subscribe', { method: 'DELETE' })
      addStep(`3. DELETE /api/push/subscribe → ${res.status}`, res.ok)
      const { error } = await supabase
        .from('user_profiles')
        .update({ push_notifications_enabled: false })
        .eq('id', userId)
      addStep(`4. user_profiles update → ${error ? error.message : 'ok'}`, !error)
      if (!error) setNotificationsEnabled(false)
      return
    }

    // ── Enable path ──
    const browserPerm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
    addStep(`3. Browser Notification.permission = ${browserPerm}`, browserPerm === 'granted')
    addStep(`4. Supabase permStatus = ${permStatus}`, permStatus === 'granted')

    let effectivePerm = browserPerm
    if (browserPerm !== 'granted') {
      if (typeof Notification === 'undefined') {
        addStep('5. ✗ Notification API unavailable', false)
        return
      }
      addStep('5. Requesting permission…', true)
      effectivePerm = await Notification.requestPermission()
      addStep(`6. Permission result = ${effectivePerm}`, effectivePerm === 'granted')
      if (effectivePerm !== 'granted') {
        await supabase.from('user_profiles').update({
          push_notifications_enabled: false,
          push_notifications_permission_status: effectivePerm,
        }).eq('id', userId)
        setNotificationsEnabled(false)
        setPermStatus(effectivePerm as 'granted' | 'denied' | 'default')
        return
      }
    }

    // Permission confirmed granted — now subscribe
    const hasSW = 'serviceWorker' in navigator
    const hasPM = 'PushManager' in window
    addStep(`5. serviceWorker in navigator = ${hasSW}`, hasSW)
    addStep(`6. PushManager in window = ${hasPM}`, hasPM)
    if (!hasSW || !hasPM) return

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    addStep(`7. VAPID key present = ${!!vapidKey}${vapidKey ? ` (${vapidKey.slice(0, 12)}…)` : ''}`, !!vapidKey)
    if (!vapidKey) return

    let swReg: ServiceWorkerRegistration | null = null
    try {
      addStep('8. Waiting for SW ready…', true)
      swReg = await navigator.serviceWorker.ready
      addStep(`9. SW ready — state=${swReg.active?.state ?? 'no active worker'} scope=${swReg.scope}`, true)
    } catch (err) {
      addStep(`9. ✗ SW ready threw: ${String(err)}`, false)
      return
    }

    let subscription: PushSubscription | null = null
    try {
      subscription = await swReg.pushManager.getSubscription()
      addStep(`10. Existing subscription = ${subscription ? subscription.endpoint.slice(0, 50) + '…' : 'none'}`, true)
    } catch (err) {
      addStep(`10. ✗ getSubscription() threw: ${String(err)}`, false)
    }

    if (!subscription) {
      try {
        addStep('11. Calling pushManager.subscribe()…', true)
        const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4)
        const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/')
        const rawData = atob(base64)
        const buffer = new ArrayBuffer(rawData.length)
        const view = new Uint8Array(buffer)
        for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i)

        subscription = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: buffer,
        })
        addStep(`12. Subscription created — endpoint: ${subscription.endpoint.slice(0, 50)}…`, true)
      } catch (err) {
        addStep(`12. ✗ pushManager.subscribe() threw: ${String(err)}`, false)
        return
      }
    }

    const json = subscription.toJSON()
    const hasKeys = !!(json.endpoint && json.keys?.p256dh && json.keys?.auth)
    addStep(`13. toJSON() has endpoint+keys = ${hasKeys}`, hasKeys)
    if (!hasKeys) return

    try {
      addStep('14. POSTing to /api/push/subscribe…', true)
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const body = await res.text()
      addStep(`15. API response: ${res.status} ${body}`, res.ok)
      if (!res.ok) return
    } catch (err) {
      addStep(`15. ✗ fetch threw: ${String(err)}`, false)
      return
    }

    const { error: profileErr } = await supabase.from('user_profiles').update({
      push_notifications_enabled: true,
      push_notifications_permission_status: 'granted',
    }).eq('id', userId)
    addStep(`16. user_profiles update → ${profileErr ? profileErr.message : 'ok'}`, !profileErr)

    if (!profileErr) {
      setNotificationsEnabled(true)
      setPermStatus('granted')
    }
  }

  if (!isOpen) return null

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0'

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />

        {/* App name */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">DayOS</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Version {version}</p>
        </div>

        {/* User info */}
        <div className="bg-zinc-800/50 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-zinc-500 mb-0.5">Logged in as</p>
          <p className="text-sm text-zinc-200 font-medium">{userEmail}</p>
        </div>

        {/* Morning reminder toggle */}
        <div className="bg-zinc-800/50 rounded-xl px-4 py-3.5 mb-2 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-200 font-medium">Morning reminder</p>
            <p className="text-xs text-zinc-500 mt-0.5">Daily reminder to check in.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            onClick={() => handleNotificationToggle(!notificationsEnabled)}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${notificationsEnabled ? 'bg-white' : 'bg-zinc-700'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-zinc-900 shadow transition-transform ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Debug panel — temporary */}
        {debugSteps.length > 0 && (
          <div className="mb-2 rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 max-h-48 overflow-y-auto">
            {debugSteps.map((s, i) => (
              <p key={i} className={`text-[11px] font-mono leading-5 ${s.ok ? 'text-zinc-400' : 'text-red-400'}`}>
                {s.ok ? '✓' : '✗'} {s.msg}
              </p>
            ))}
          </div>
        )}

        {/* Memory */}
        <button
          onClick={onMemoryOpen}
          className="w-full bg-zinc-800 text-zinc-200 rounded-xl px-4 py-3.5 font-medium text-sm hover:bg-zinc-700 active:bg-zinc-600 transition-colors text-left mb-2"
        >
          Manage memory
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full bg-zinc-800 text-red-400 rounded-xl px-4 py-3.5 font-medium text-sm hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
        >
          Sign out
        </button>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="w-full mt-3 text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
