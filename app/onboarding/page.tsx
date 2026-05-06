'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'name' | 'welcome'

function OnboardingFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isTestMode = searchParams.get('onboarding') === '1'

  const [step, setStep] = useState<Step>('name')
  const [preferredName, setPreferredName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleNameContinue(e: React.FormEvent) {
    e.preventDefault()
    if (!preferredName.trim()) return
    setStep('welcome')
  }

  async function handleStartCheckIn() {
    // Test mode: skip saving, go straight to conversation with autostart
    if (isTestMode) {
      router.push('/conversation?autostart=1')
      return
    }

    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

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
        onboarding_complete: true,
      })

    if (upsertError) {
      setError(upsertError.message)
      setIsLoading(false)
      return
    }

    router.push('/conversation?autostart=1')
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {step === 'name' && (
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-white leading-snug mb-2">
                Welcome to DayOS
              </h2>
              <p className="text-zinc-400 text-sm">Great to have you here.</p>
            </div>

            <p className="text-zinc-300 text-sm font-medium mb-3">What should we call you?</p>

            <form onSubmit={handleNameContinue} className="space-y-4">
              <input
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                autoFocus
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
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

        {step === 'welcome' && (
          <div>
            <h2 className="text-2xl font-semibold text-white leading-snug mb-6">
              Welcome, {preferredName}
            </h2>

            <div className="space-y-4 text-sm text-zinc-400 leading-relaxed mb-8">
              <p>DayOS helps you clear your head, reflect honestly, and decide what matters today.</p>
              <p>Come back throughout the day whenever things drift, change, or need rethinking.</p>
              <p>The more honest and open you are, the more useful it becomes.</p>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed mb-8">
              Your conversations stay private.<br />
              Saved memories are encrypted and only visible to you.
            </p>

            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleStartCheckIn}
              disabled={isLoading}
              className="w-full bg-white text-zinc-950 rounded-xl px-4 py-3 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Starting…' : 'Start first check-in'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingFlow />
    </Suspense>
  )
}
