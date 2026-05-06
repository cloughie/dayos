'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
  onMemoryOpen: () => void
}

export default function SettingsModal({ isOpen, onClose, userEmail, onMemoryOpen }: SettingsModalProps) {
  const router = useRouter()

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
