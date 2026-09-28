'use client'

import Link from 'next/link'

const APP_STORE_URL = 'https://apps.apple.com/app/id6788535707'

function fireGAEvent(name: string) {
  if (typeof window !== 'undefined' && typeof (window as unknown as { gtag?: Function }).gtag === 'function') {
    ;(window as unknown as { gtag: Function }).gtag('event', name)
  }
}

export default function LandingCTAs() {
  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => fireGAEvent('ios_download_clicked')}
          className="inline-flex items-center justify-center bg-white text-zinc-950 rounded-xl px-6 py-3.5 font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 w-full sm:w-auto"
        >
          Download for iOS
        </a>
        <Link
          href="/auth/signup"
          onClick={() => fireGAEvent('continue_web_clicked')}
          className="inline-flex items-center justify-center border border-zinc-700 text-white rounded-xl px-6 py-3.5 font-semibold text-sm hover:border-zinc-500 hover:bg-zinc-900 active:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 w-full sm:w-auto"
        >
          Continue on Web
        </Link>
      </div>
      <p className="text-xs text-zinc-500 sm:pl-0.5">
        Available on iPhone, or continue instantly in your browser.
      </p>
    </div>
  )
}
