'use client'

import { useEffect } from 'react'

/**
 * Hides the native Capacitor splash screen as soon as this component mounts
 * (i.e. the first page has rendered). Lives in the root layout so it fires
 * on every route — login, conversation, etc. — without needing per-page calls.
 *
 * No-ops in the browser / PWA context where Capacitor is not the native shell.
 */
export default function CapacitorInit() {
  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return
      import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        SplashScreen.hide({ fadeOutDuration: 300 })
      })
    })
  }, [])

  return null
}
