'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush, savePushSubscription } from '@/lib/push'
import { isNative, requestNativePermission, registerForNativePush } from '@/lib/nativePush'
import { hapticLight } from '@/lib/haptics'
import { useBottomSheetGesture } from '@/lib/useBottomSheetGesture'

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
  const [isAdmin, setIsAdmin] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { dragY, isDragging } = useBottomSheetGesture(sheetRef, scrollRef, isOpen, onClose)

  useEffect(() => {
    if (!isOpen) return
    // Always reset busy on open — guards against stuck state if a previous
    // async attempt never reached its finally block (e.g. navigation mid-flow).
    setNotificationsBusy(false)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('user_profiles')
        .select('push_notifications_enabled, push_notifications_permission_status, dev_tools_enabled')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) return
          setNotificationsEnabled(data.push_notifications_enabled ?? false)
          setPermStatus((data.push_notifications_permission_status ?? 'default') as 'granted' | 'denied' | 'default')
          setIsAdmin(data.dev_tools_enabled ?? false)
        })
    })
  }, [isOpen])

  async function handleNotificationToggle(enable: boolean) {
    if (!userId) return
    if (notificationsBusy) return

    hapticLight()
    setNotificationsBusy(true)
    const supabase = createClient()

    try {
      if (enable) {
        if (isNative()) {
          // Native iOS: request permission via the system dialog, then register with APNs
          const permission = await requestNativePermission()
          if (permission !== 'granted') return
          const token = await registerForNativePush()
          if (!token) return
          const res = await fetch('/api/push/register-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apns_token: token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
          }).catch(() => null)
          if (!res || !res.ok) return
          setNotificationsEnabled(true)
        } else if (permStatus === 'granted') {
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
        if (isNative()) {
          await fetch('/api/push/register-device', { method: 'DELETE' }).catch(() => {})
        } else {
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

  async function handleDeleteAccount() {
    if (deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setDeleteError(body.error ?? 'Something went wrong. Please try again.')
        return
      }
      // Sign out locally — auth user is already gone on the server
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/auth/login')
      router.refresh()
    } catch {
      setDeleteError('Something went wrong. Please try again.')
    } finally {
      setDeleteBusy(false)
    }
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
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-2xl border-t border-zinc-800 safe-bottom max-h-[90vh] flex flex-col"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-5 mb-5 shrink-0" />

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-6">
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
              onClick={() => handleNotificationToggle(!notificationsEnabled)}
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

          {/* Sign out + Delete account */}
          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-2 pb-2">
            <button
              onClick={handleLogout}
              className="w-full bg-zinc-800/50 text-red-400 rounded-xl px-4 py-3.5 font-medium text-sm hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors text-left"
            >
              Sign out
            </button>
            <button
              onClick={() => { setShowDeleteConfirm(true); setDeleteError(null) }}
              className="w-full bg-zinc-800/50 text-zinc-500 rounded-xl px-4 py-3.5 font-medium text-sm hover:bg-zinc-700/50 active:bg-zinc-600/50 transition-colors text-left"
            >
              Delete account
            </button>
          </div>
        </div>

        {/* Cancel — always visible, not scrolled away */}
        <button
          onClick={onClose}
          className="w-full text-zinc-500 text-sm py-3 px-6 hover:text-zinc-300 transition-colors shrink-0"
        >
          Cancel
        </button>

        {/* Delete account confirmation sheet */}
        {showDeleteConfirm && (
          <>
            <div className="fixed inset-0 bg-black/70 z-[55] backdrop-blur-sm pointer-events-none" aria-hidden="true" />
            <div className="fixed inset-0 z-[60] flex items-end">
              <div className="w-full bg-zinc-900 rounded-t-2xl border-t border-zinc-800 p-6 safe-bottom">
                <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-6" />

                <h3 className="text-base font-bold text-white mb-2">Delete account?</h3>
                <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                  This permanently deletes your account and all associated DayOS data — including your plans, check-in history, and memories. This cannot be undone.
                </p>

                {deleteError && (
                  <p className="text-xs text-red-400 mb-4">{deleteError}</p>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteBusy}
                    className={`w-full bg-red-600 text-white rounded-xl px-4 py-3.5 font-semibold text-sm transition-opacity ${deleteBusy ? 'opacity-50 pointer-events-none' : 'hover:bg-red-500 active:bg-red-700'}`}
                  >
                    {deleteBusy ? 'Deleting…' : 'Permanently delete my account'}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                    disabled={deleteBusy}
                    className="w-full text-zinc-400 text-sm py-3 hover:text-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
