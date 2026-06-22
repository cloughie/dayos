import type { CapacitorConfig } from '@capacitor/cli'

// Override this env var to point the native shell at a different backend:
//   CAPACITOR_SERVER_URL=http://localhost:3000 npx cap sync
// Defaults to production so accidental `cap sync` without the var set is safe.
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? 'https://trydayos.com'

// Allow cleartext HTTP only when pointing at a local dev server
const allowCleartext = serverUrl.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.trydayos.app',
  appName: 'DayOS',
  // webDir is required by Capacitor even in remote-URL mode.
  // We point it at public/ (already exists, contains icons/manifest).
  // Its contents are NOT served to the app — the server.url below takes over.
  webDir: 'public',
  server: {
    // Origin only — no path. Capacitor checks navigation URLs with starts(with: serverURL),
    // so including a path (e.g. /launch) causes every redirect away from that path to be
    // treated as external and opened in Safari instead of staying in the WKWebView.
    url: serverUrl,
    cleartext: allowCleartext,
  },
  ios: {
    // Keep the status bar transparent so our zinc-950 header fills edge-to-edge
    backgroundColor: '#09090b',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      // Happy path: CapacitorInit (root layout) calls SplashScreen.hide()
      // as soon as the first page renders, overriding the duration below.
      // Fallback: if JS never loads (server down, network error), the native
      // layer auto-hides after 4 s so users are never permanently stuck.
      launchShowDuration: 4000,
      launchAutoHide: true,
      // Fade duration in ms — 300 ms feels intentional without dragging
      launchFadeOutDuration: 300,
      // Match the app's dark background so there's no colour flash during fade
      backgroundColor: '#09090b',
      // No spinner — the splash image is enough
      showSpinner: false,
      // Prevent a white flash on iOS between launch screen and WebView init
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
}

export default config
