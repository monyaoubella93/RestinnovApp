import { useEffect, useRef, useState } from 'react'
import { fetchNotifications } from '../api'
import type { MaintenanceAlerteNiveau, NotificationsData } from '../types'

const POLL_INTERVAL_MS = 30000

// Single source of truth for the 3 severity levels shown in the bell for
// maintenance alerts (a 4th "info" level exists on the model -- the
// one-off "l'agent a commencé" event -- but is styled like "rappel" since
// it's not itself urgent). Rappel stays neutral/blue, matching the rest of
// the bell's normal notifications; urgente is orange; critique is red.
const ALERTE_NIVEAU_LABELS: Record<MaintenanceAlerteNiveau, string> = {
  info: 'Info',
  rappel: 'Rappel',
  urgente: 'Urgente',
  critique: 'Critique',
}

const ALERTE_NIVEAU_STYLES: Record<MaintenanceAlerteNiveau, string> = {
  info: 'bg-brand-pale text-brand',
  rappel: 'bg-brand-pale text-brand',
  urgente: 'bg-warning-bg text-warning-text',
  critique: 'bg-danger-bg text-danger',
}

interface NotificationBellProps {
  onNavigateToSejour: (sejourId: number) => void
  onNavigateToTicketsMaintenance: () => void
}

export function NotificationBell({ onNavigateToSejour, onNavigateToTicketsMaintenance }: NotificationBellProps) {
  const [data, setData] = useState<NotificationsData | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const refresh = () => {
    fetchNotifications()
      .then(setData)
      .catch(() => {
        // A failed background refresh just leaves the last known count
        // displayed -- nothing worth surfacing as an error banner here.
      })
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const menagesCount = data?.menages_a_valider_count ?? 0
  const problemesCount = data?.problemes_signales_count ?? 0
  const alertes = data?.alertes_maintenance ?? []
  const alertesCount = data?.alertes_maintenance_count ?? 0
  const critiqueCount = alertes.filter((a) => a.niveau === 'critique').length
  const urgenteCount = alertes.filter((a) => a.niveau === 'urgente').length
  const totalCount = menagesCount + problemesCount + alertesCount

  // A problème signalé (or a critique alert -- an incoming guest, the most
  // urgent kind) is always the most urgent category -- it wins the badge
  // color. Then urgente alerts and ménages à valider (both orange), then
  // any remaining rappel/info alert (blue).
  const badgeStyle =
    problemesCount > 0 || critiqueCount > 0
      ? 'bg-danger text-white'
      : urgenteCount > 0 || menagesCount > 0
        ? 'bg-warning text-white'
        : alertesCount > 0
          ? 'bg-brand text-white'
          : null

  const handleToggle = () => {
    if (!open) refresh()
    setOpen((current) => !current)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-field border border-border-default bg-surface text-ink-tertiary hover:bg-table-header-bg"
      >
        <span aria-hidden="true" className="text-lg">
          🔔
        </span>
        {totalCount > 0 && badgeStyle && (
          <span
            data-testid="notification-badge"
            className={`absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold ${badgeStyle}`}
          >
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {totalCount === 0 ? (
            <p className="p-4 text-sm text-gray-500">Aucune notification en attente.</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto p-3">
              {menagesCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                    Ménages à valider
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {menagesCount}
                    </span>
                  </h3>
                  <ul className="mt-2 divide-y divide-amber-100">
                    {data?.menages_a_valider.map((menage) => (
                      <li key={menage.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onNavigateToSejour(menage.sejour_id)
                          }}
                          className="w-full rounded-md px-1 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
                        >
                          {menage.appartement
                            ? `${menage.appartement.nom} — ${menage.appartement.adresse}`
                            : 'Appartement supprimé'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {problemesCount > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800">
                    Problèmes signalés
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      {problemesCount}
                    </span>
                  </h3>
                  <ul className="mt-2 divide-y divide-red-100">
                    {data?.problemes_signales.map((probleme) => (
                      <li key={probleme.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onNavigateToTicketsMaintenance()
                          }}
                          className="w-full rounded-md px-1 py-2 text-left text-sm text-red-900 hover:bg-red-100"
                        >
                          {probleme.appartement
                            ? `${probleme.appartement.nom} — ${probleme.appartement.adresse}`
                            : 'Appartement supprimé'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {alertesCount > 0 && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    Alertes de maintenance
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800">
                      {alertesCount}
                    </span>
                  </h3>
                  <ul className="mt-2 divide-y divide-gray-200">
                    {alertes.map((alerte) => (
                      <li key={alerte.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onNavigateToTicketsMaintenance()
                          }}
                          className="w-full rounded-md px-1 py-2 text-left text-sm text-gray-900 hover:bg-gray-100"
                        >
                          <span
                            className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ALERTE_NIVEAU_STYLES[alerte.niveau]}`}
                          >
                            {ALERTE_NIVEAU_LABELS[alerte.niveau]}
                          </span>
                          {alerte.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
