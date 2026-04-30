'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'name' | 'notes' | 'saving'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('name')
  const [preferredName, setPreferredName] = useState('')
  const [onboardingNotes, setOnboardingNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!preferredName.trim()) return
    setStep('notes')
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    setStep('saving')

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/auth/login')
      return
    }

    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email ?? '',
        preferred_name: preferredName.trim(),
        onboarding_notes: onboardingNotes.trim() || null,
        onboarding_complete: true,
      })

    if (upsertError) {
      setError(upsertError.message)
      setIsLoading(false)
      setStep('notes')
      return
    }

    router.push('/conversation')
    router.refresh()
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {step === 'name' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <p className="text-zinc-400 text-sm mb-1">Getting started</p>
              <h2 className="text-2xl font-semibold text-white leading-snug">
                What should I call you?
              </h2>
            </div>

            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                autoFocus
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors text-lg"
                placeholder="Your first name"
              />
              <button
                type="submit"
                disabled={!preferredName.trim()}
                className="w-full bg-white text-zinc-950 rounded-xl px-4 py-3 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </form>
          </div>
        )}

        {step === 'notes' && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <p className="text-zinc-400 text-sm mb-1">One more thing, {preferredName}</p>
              <h2 className="text-2xl font-semibold text-white leading-snug">
                Anything important I should know right now?
              </h2>
              <p className="mt-2 text-zinc-500 text-sm">
                Upcoming deadlines, health stuff, anything relevant — or skip if nothing comes to mind.
              </p>
            </div>

            <form onSubmit={handleComplete} className="space-y-4">
              <textarea
                value={onboardingNotes}
                onChange={(e) => setOnboardingNotes(e.target.value)}
                autoFocus
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                placeholder="e.g. Big presentation on Friday, been a bit sleep deprived this week…"
              />

              {error && (
                <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={isLoading}
                  className="flex-1 bg-zinc-800 text-zinc-300 rounded-xl px-4 py-3 font-medium text-sm hover:bg-zinc-700 active:bg-zinc-600 transition-colors disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-white text-zinc-950 rounded-xl px-4 py-3 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Saving…' : "Let's go"}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'saving' && (
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">Setting things up…</p>
          </div>
        )}
      </div>
    </div>
  )
}
