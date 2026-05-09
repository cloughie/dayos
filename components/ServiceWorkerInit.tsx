'use client'

import { useEffect } from 'react'

export default function ServiceWorkerInit() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('[SW] Registration failed:', err)
      })
    }
  }, [])

  return null
}
