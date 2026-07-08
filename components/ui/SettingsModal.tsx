'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush, savePushSubscription } from '@/lib/push'
import { isNative, requestNativePermission, registerForNativePush } from '@/lib/nativePush'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
  onMemoryOpen: () => void
  onPrivacyOpen: () => void
}

export default function SettingsModal({ isOpen, onClose, userEmail, onMemoryOpen, onPrivacyOpen }: SettingsModalProps) {
  const router = useRouter()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationsBusy, setNotificationsBusy] = useState(false)
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'default'>('default')
  const [userId, setUserId] = useState<string | null>(null)
  const [modelPref, setModelPref] = useState<'claude' | 'openai'>('claude')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const stored = localStorage.getItem('dayos_model_pref')
    setModelPref(stored === 'openai' ? 'openai' : 'claude')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    // Always reset busy on open — guards against stuck state if a previous
    // async attempt never reached its finally block (e.g. navigation mid-flow).
    setNotificationsBusy(false)
    console.log('[Settings] Modal opened. isNative:', isNative())
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        console.warn('[Settings] No authenticated user found')
        return
      }
      setUserId(user.id)
      supabase
        .from('user_profiles')
        .select('push_notifications_enabled, push_notifications_permission_status, dev_tools_enabled')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) return
          console.log('[Settings] Profile loaded:', {
            push_notifications_enabled: data.push_notifications_enabled,
            push_notifications_permission_status: data.push_notifications_permission_status,
          })
          setNotificationsEnabled(data.push_notifications_enabled ?? false)
          setPermStatus((data.push_notifications_permission_status ?? 'default') as 'granted' | 'denied' | 'default')
          setIsAdmin(data.dev_tools_enabled ?? false)
        })
    })
  }, [isOpen])

  async function handleNotificationToggle(enable: boolean) {
    console.log('[Settings] Toggle clicked. enable:', enable, '| userId:', userId, '| isNative:', isNative(), '| busy:', notificationsBusy)
    if (!userId) {
      console.warn('[Settings] Aborting: userId is null (auth not loaded yet)')
      return
    }
    if (notificationsBusy) {
      console.warn('[Settings] Aborting: already in progress')
      return
    }

    setNotificationsBusy(true)
    const supabase = createClient()

    try {
      if (enable) {
        if (isNative()) {
          // Native iOS: request permission via the system dialog, then register with APNs
          console.log('[Settings] Native path: requesting permission...')
          const permission = await requestNativePermission()
          console.log('[Settings] Permission result:', permission)
          if (permission !== 'granted') {
            console.warn('[Settings] Permission not granted, aborting')
            return
          }
          const token = await registerForNativePush()
          console.log('[Settings] APNs token:', token)
          if (!token) {
            console.error('[Settings] No token returned, aborting')
            return
          }
          console.log('[Settings] POSTing to /api/push/register-device...')
          const res = await fetch('/api/push/register-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apns_token: token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
          }).catch((err) => {
            console.error('[Settings] fetch threw:', err)
            return null
          })
          if (!res) return
          const body = await res.json().catch(() => null)
          console.log('[Settings] register-device response:', res.status, JSON.stringify(body))
          if (!res.ok) {
            console.error('[Settings] register-device failed, aborting')
            return
          }
          setNotificationsEnabled(true)
        } else if (permStatus === 'granted') {
          console.log('[Settings] Web path: permission already granted, re-subscribing...')
          const subscription = await subscribeToPush()
          if (subscription) await savePushSubscription(subscription)
          await supabase.from('user_profiles').update({ push_notifications_enabled: true }).eq('id', userId)
          setNotificationsEnabled(true)
        } else {
          console.log('[Settings] Web path: requesting browser permission...')
          if (typeof Notification === 'undefined') {
            console.warn('[Settings] Notification API unavailable (WKWebView without native path?)')
            return
          }
          const permission = await Notification.requestPermission()
          const granted = permission === 'granted'
          console.log('[Settings] Browser permission:', permission)
          if (granted) {
            const subscription = await subscribeToPush()
            if (subscription) await savePushSubscription(subscription)
          }
          await supabase.from('user_profiles').update({
            push_notifications_enabled: granted,
            push_notifications_permission_status: permission,
          }).eq('id', userId)
          setNotificationsEnabled(granted)
          setPermStatus(permission as 'granted' | 'denied' | 'default')
        }
      } else {
        if (isNative()) {
          console.log('[Settings] Native path: unregistering device...')
          await fetch('/api/push/register-device', { method: 'DELETE' }).catch(() => {})
        } else {
          console.log('[Settings] Web path: unsubscribing...')
          await fetch('/api/push/subscribe', { method: 'DELETE' })
          await supabase.from('user_profiles').update({ push_notifications_enabled: false }).eq('id', userId)
        }
        setNotificationsEnabled(false)
      }
    } finally {
      setNotificationsBusy(false)
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
      {/* Backdrop blur — pointer-events-none because backdrop-filter captures all
          touches across the viewport in iOS WKWebView regardless of z-index.
          Tap-to-close is handled by the transparent layer below. */}
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm pointer-events-none" aria-hidden="true" />

      {/* Tap-outside-to-close — sits above backdrop, below modal panel */}
      <div className="fixed inset-0 z-[45]" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />

        {/* App name */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">DayOS</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Version {version}</p>
        </div>

        {/* Account */}
        <div className="bg-zinc-800/50 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-zinc-500 mb-0.5">Logged in as</p>
          <p className="text-sm text-zinc-200 font-medium">{userEmail}</p>
        </div>

        {/* Preferences */}
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">Preferences</p>
          {/* Full-row button: avoids iOS WKWebView issues with role="switch"/disabled on small elements */}
          <button
            type="button"
            onClick={() => {
              console.log('[Settings] Row tapped. busy:', notificationsBusy, 'userId:', userId, 'isNative:', isNative())
              handleNotificationToggle(!notificationsEnabled)
            }}
            className={`w-full bg-zinc-800/50 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4 text-left transition-opacity ${notificationsBusy ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <div>
              <p className="text-sm text-zinc-200 font-medium">Morning reminder</p>
              <p className="text-xs text-zinc-500 mt-0.5">Daily reminder to check in.</p>
            </div>
            {/* Visual switch — decorative only, pointer-events handled by parent button */}
            <span
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors pointer-events-none ${notificationsEnabled ? 'bg-white' : 'bg-zinc-700'}`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-zinc-900 shadow transition-transform ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </span>
          </button>
        </div>

        {/* Developer — admin only */}
        {isAdmin && (
          <div className="mb-5">
            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">Developer</p>
            <div className="bg-zinc-800/50 rounded-xl px-4 py-3.5 mb-2">
              <p className="text-sm text-zinc-200 font-medium mb-3">Model</p>
              <div className="flex gap-2">
                {(['claude', 'openai'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModelPref(m)
                      localStorage.setItem('dayos_model_pref', m)
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      modelPref === m
                        ? 'bg-white text-zinc-900'
                        : 'bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {m === 'claude' ? 'Claude' : 'OpenAI'}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('dayos_conversation')
                localStorage.removeItem('dayos_plan')
                window.location.reload()
              }}
              className="w-full bg-zinc-800/50 text-amber-400 rounded-xl px-4 py-3.5 text-sm font-medium text-left hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors"
            >
              Force fresh check-in
            </button>
          </div>
        )}

        {/* Privacy & Data */}
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">Privacy &amp; Data</p>
          <div className="rounded-xl overflow-hidden flex flex-col gap-px">
            <button
              onClick={() => { onClose(); onPrivacyOpen() }}
              className="w-full bg-zinc-800/50 px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <p className="text-sm text-zinc-200 font-medium">Privacy &amp; Security</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              onClick={onMemoryOpen}
              className="w-full bg-zinc-800/50 px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors text-left"
            >
              <p className="text-sm text-zinc-200 font-medium">Manage memory</p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Sign out */}
        <div className="border-t border-zinc-800 pt-4 mb-1">
          <button
            onClick={handleLogout}
            className="w-full bg-zinc-800/50 text-red-400 rounded-xl px-4 py-3.5 font-medium text-sm hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors text-left"
          >
            Sign out
          </button>
        </div>

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
