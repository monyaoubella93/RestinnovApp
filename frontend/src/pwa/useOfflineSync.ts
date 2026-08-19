import { useCallback, useEffect, useState } from 'react'
import { authHeadersForOfflineSync } from '../api'
import { countQueuedActions, flushQueue } from './offlineQueue'

export interface OfflineSyncState {
  online: boolean
  pendingCount: number
}

/**
 * Reflects the real state of the offline queue in the UI (the agent
 * header's sync pill, see README §PWA: "la pastille de l'en-tête ...
 * reflète l'état réel de cette file") -- refreshes the pending count on
 * mount, flushes the queue whenever the browser reports it's back online,
 * and re-checks periodically in case the 'online' event doesn't fire
 * (some browsers only update navigator.onLine reliably).
 */
export function useOfflineSync(): OfflineSyncState {
  const [online, setOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  const refreshCount = useCallback(() => {
    countQueuedActions()
      .then(setPendingCount)
      .catch(() => {
        // Nothing actionable if IndexedDB itself is unavailable -- the
        // pill just won't reflect a queue that can't exist anyway.
      })
  }, [])

  const trySync = useCallback(() => {
    if (!navigator.onLine) return
    flushQueue(authHeadersForOfflineSync())
      .then(() => refreshCount())
      .catch(() => {
        // Flush failed outright (still offline, or a genuine server error) --
        // the count is refreshed regardless so the pill stays accurate.
        refreshCount()
      })
  }, [refreshCount])

  useEffect(() => {
    refreshCount()
    trySync()

    const handleOnline = () => {
      setOnline(true)
      trySync()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Some mobile browsers keep firing 'online' inconsistently on flaky
    // connections -- a periodic nudge means the pill (and the queue) don't
    // stay stuck if that one event was missed.
    const interval = setInterval(trySync, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [refreshCount, trySync])

  return { online, pendingCount }
}
