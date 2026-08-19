import { registerSW } from 'virtual:pwa-register'

// autoUpdate: a new service worker takes over silently on its next
// activation (see vite.config.ts) -- no "new version available" prompt to
// build, matching the README's "registerType:autoUpdate est le plus simple".
export function registerServiceWorker() {
  if (import.meta.env.PROD) {
    registerSW({ immediate: true })
  }
}
