import { useEffect, useRef, useState } from 'react'
import { fetchNotifications } from '../api'
import type { MaintenanceAlerteNiveau, NotificationsData } from '../types'

const POLL_INTERVAL_MS = 30000

// Single source of truth for the 3 alert severity levels shown in the bell
// (a 4th "info" level exists on the model but is not produced by the
// scheduled job today) -- rappel stays neutral/blue like the rest of the
// bell's normal notifications, urgente is orange, critique is red.
const ALERTE_NIVEAU_LABELS: Record<MaintenanceAlerteNiveau, string> = {
  info: 'Info',
  rappel: 'Rappel',
  urgente: 'Urgente',
  critique: 'Critique',
}

const ALERTE_NIVEAU_STYLES: Record<MaintenanceAlerteNiveau, string> = {
  info: 'bg-blue-100 text-blue-800',
  rappel: 'bg-blue-100 text-blue-800',
  urgente: 'bg-orange-100 text-orange-800',
  critique: 'bg-red-100 text-red-800',
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
  // color. Then urgente alerts (orange), then ménages à valider (purple),
  // then any remaining rappel/info alert (blue).
  const badgeStyle =
    problemesCount > 0 || critiqueCount > 0
      ? 'bg-red-600 text-white'
      : urgenteCount > 0
        ? 'bg-orange-500 text-white'
        : menagesCount > 0
          ? 'bg-purple-600 text-white'
          : alertesCount > 0
            ? 'bg-blue-600 text-white'
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
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <span aria-hidden="true" className="text-xl">
          🔔
        </span>
        {badgeStyle && (
          <span
            data-testid="notification-badge"
            className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${badgeStyle}`}
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
                <div className="rounded-md border border-purple-200 bg-purple-50 p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-800">
                    Ménages à valider
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                      {menagesCount}
                    </span>
                  </h3>
                  <ul className="mt-2 divide-y divide-purple-100">
                    {data?.menages_a_valider.map((menage) => (
                      <li key={menage.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onNavigateToSejour(menage.sejour_id)
                          }}
                          className="w-full rounded-md px-1 py-2 text-left text-sm text-purple-900 hover:bg-purple-100"
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
