'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush, savePushSubscription } from '@/lib/push'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
  onMemoryOpen: () => void
}

export default function SettingsModal({ isOpen, onClose, userEmail, onMemoryOpen }: SettingsModalProps) {
  const router = useRouter()
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'default'>('default')
  const [userId, setUserId] = useState<string | null>(null)

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
    if (!userId) return
    const supabase = createClient()

    if (enable) {
      if (permStatus === 'granted') {
        const subscription = await subscribeToPush()
        if (subscription) await savePushSubscription(subscription)
        await supabase.from('user_profiles').update({ push_notifications_enabled: true }).eq('id', userId)
        setNotificationsEnabled(true)
      } else {
        if (typeof Notification === 'undefined') return
        const permission = await Notification.requestPermission()
        const granted = permission === 'granted'
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
      await fetch('/api/push/subscribe', { method: 'DELETE' })
      await supabase.from('user_profiles').update({ push_notifications_enabled: false }).eq('id', userId)
      setNotificationsEnabled(false)
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

        {/* Account */}
        <div className="bg-zinc-800/50 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-zinc-500 mb-0.5">Logged in as</p>
          <p className="text-sm text-zinc-200 font-medium">{userEmail}</p>
        </div>

        {/* Preferences */}
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">Preferences</p>
          <div className="bg-zinc-800/50 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
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
        </div>

        {/* Privacy & Data */}
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-600 uppercase tracking-wider mb-2 px-1">Privacy &amp; Data</p>
          <div className="rounded-xl overflow-hidden flex flex-col gap-px">
            <button
              onClick={() => { onClose(); router.push('/privacy') }}
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
