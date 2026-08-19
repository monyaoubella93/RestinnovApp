import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari never fires beforeinstallprompt but exposes this flag once installed.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Captures `beforeinstallprompt` (README §PWA: "capter beforeinstallprompt,
 * afficher la carte «Installer sur le téléphone»") and hides itself once
 * the app is already running standalone -- Chrome only fires the event
 * once per page load, so it has to be caught early and held onto.
 */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(isStandaloneDisplay)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredEvent(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setDeferredEvent(null)
      setStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferredEvent) return
    await deferredEvent.prompt()
    const { outcome } = await deferredEvent.userChoice
    if (outcome === 'accepted') setStandalone(true)
    setDeferredEvent(null)
  }

  return {
    canInstall: deferredEvent !== null && !standalone,
    promptInstall,
  }
}
