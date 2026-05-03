'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const linkExpired = searchParams.get('error') === 'link_expired'

  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const supabase = createClient()

    // Use the bare /auth/callback URL (no query params) so it matches the
    // redirect URL whitelisted in Supabase dashboard exactly.
    // Supabase matches redirect URLs literally — adding ?next=... causes a mismatch
    // and falls back to the Site URL. Recovery is detected in the callback instead.
    // IMPORTANT: ensure <your-origin>/auth/callback is listed in your Supabase
    // dashboard under Authentication → URL Configuration → Redirect URLs.
    const redirectTo = `${window.location.origin}/auth/callback`

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (resetError) {
      console.error('[forgot-password] resetPasswordForEmail failed:', {
        message: resetError.message,
        status: resetError.status,
        redirectTo,
      })
      if (resetError.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setIsLoading(false)
      return
    }

    setSubmitted(true)
    setIsLoading(false)
  }

  return (
    <>
      {linkExpired && (
        <div className="mb-4 bg-red-950/50 border border-red-900 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">This reset link has expired or is invalid. Enter your email to receive a new one.</p>
        </div>
      )}

      {submitted ? (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
            <p className="text-zinc-300 text-sm leading-relaxed">
              If an account exists for <span className="text-white font-medium">{email}</span>, a reset link has been sent. Check your inbox.
            </p>
          </div>
          <p className="text-center text-sm text-zinc-400">
            <Link href="/auth/login" className="text-white font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-white text-zinc-950 rounded-xl px-4 py-3 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
            <Link href="/auth/login" className="text-white font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </>
  )
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">DayOS</h1>
          <p className="mt-2 text-zinc-400 text-sm">Reset your password</p>
        </div>

        <Suspense>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
