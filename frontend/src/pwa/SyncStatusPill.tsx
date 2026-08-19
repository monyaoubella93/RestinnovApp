import type { OfflineSyncState } from './useOfflineSync'

/**
 * Header sync pill (README §PWA: ambre "Hors ligne · N ... en attente" /
 * verte "... tout est synchronisé") -- reflects the real offline queue
 * state from useOfflineSync, not a static claim.
 */
export function SyncStatusPill({ online, pendingCount }: OfflineSyncState) {
  const degraded = !online || pendingCount > 0

  if (degraded) {
    return (
      <div className="ml-auto flex h-10 items-center gap-2 rounded-field bg-warning-bg px-3 text-xs font-bold text-warning-text">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
        {online
          ? `Synchronisation… ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
          : `Hors ligne · ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`}
      </div>
    )
  }

  return (
    <div className="ml-auto flex h-10 items-center gap-2 rounded-field bg-success-bg px-3 text-xs font-bold text-success-text">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
      Tout est synchronisé
    </div>
  )
}
