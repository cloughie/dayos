'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dayos_theme'
const LIGHT_BG = '#f0efe9'
const DARK_BG = '#09090b'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    setIsDark(localStorage.getItem(STORAGE_KEY) !== 'light')
  }, [])

  function toggle() {
    const nextDark = !isDark
    setIsDark(nextDark)

    if (nextDark) {
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.style.colorScheme = 'dark'
      localStorage.setItem(STORAGE_KEY, 'dark')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', DARK_BG)
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.style.colorScheme = 'light'
      localStorage.setItem(STORAGE_KEY, 'light')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', LIGHT_BG)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        /* Sun — visible in dark mode, click to go light */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
        </svg>
      ) : (
        /* Moon — visible in light mode, click to go dark */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
