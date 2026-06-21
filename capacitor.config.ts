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
    // /launch is the native app entry point: redirects to /conversation (logged in)
    // or /auth/login (logged out). Web PWA continues to use / via manifest.json.
    url: `${serverUrl}/launch`,
    cleartext: allowCleartext,
  },
  ios: {
    // Keep the status bar transparent so our zinc-950 header fills edge-to-edge
    backgroundColor: '#09090b',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      // Hold the native splash for 2 s, giving the remote page time to load.
      // launchAutoHide: true means it fades out automatically after the delay
      // without needing any JS call from the web layer.
      launchShowDuration: 2000,
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
