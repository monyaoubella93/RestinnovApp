import { useEffect, useState } from 'react'
import { fetchMesTicketsMaintenance } from '../api'
import type { MonTicketMaintenance } from '../types'
import { EN_RETARD_STYLE, formatDateLimite, URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'
import { TicketDetailAgent } from './TicketDetailAgent'

// Only "a_refaire" needs a clear, distinct callout in this list -- the
// normal "assigne" statut is the agent's regular current work and needs no
// badge, mirroring MesMissionsSection's STATUT_BADGES pattern.
const STATUT_BADGES: Partial<Record<MonTicketMaintenance['statut'], { label: string; style: string }>> = {
  a_refaire: {
    label: 'Renvoyé par le Manager — à refaire',
    style: 'bg-red-100 text-red-800',
  },
}

export function MesTicketsSection() {
  const [tickets, setTickets] = useState<MonTicketMaintenance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Holds the actual selected ticket object, not just its id: resolving a
  // ticket moves it out of the "assigne" list this screen shows, so deriving
  // the detail view from `tickets` would make the confirmation screen
  // disappear the moment the background refresh completes.
  const [selectedTicket, setSelectedTicket] = useState<MonTicketMaintenance | null>(null)

  const chargerTickets = () => {
    setLoading(true)
    setError(null)
    fetchMesTicketsMaintenance()
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les tickets.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    chargerTickets()
  }, [])

  if (selectedTicket) {
    return (
      <TicketDetailAgent
        ticket={selectedTicket}
        onBack={() => {
          setSelectedTicket(null)
          chargerTickets()
        }}
        onResolu={() => {
          // Stays on the confirmation view -- refresh the underlying list in
          // the background so it's already up to date once the agent goes
          // back to "Mes tickets".
          chargerTickets()
        }}
        onCommence={() => {
          // Same rationale as onResolu -- keep the underlying list fresh in
          // the background while the agent stays on the detail view.
          chargerTickets()
        }}
      />
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900">Mes tickets</h3>

      {loading && <p className="mt-4 text-sm text-gray-500">Chargement...</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!loading && !error && tickets.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-5xl"
          >
            ✅
          </div>
          <p className="text-base text-gray-500">Aucun ticket pour l'instant.</p>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => setSelectedTicket(ticket)}
              className="w-full rounded-2xl border-2 border-gray-200 bg-white p-4 text-left shadow-sm hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-gray-900">
                    {ticket.appartement?.nom ?? 'Appartement'}
                    <span className="ml-2 text-xs font-normal text-gray-400">{ticket.reference}</span>
                  </p>
                  <p className="truncate text-sm text-gray-500">{ticket.appartement?.adresse}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    ticket.est_en_retard ? EN_RETARD_STYLE : URGENCE_STYLES[ticket.urgence]
                  }`}
                >
                  {ticket.est_en_retard ? 'En retard' : `Urgence ${URGENCE_LABELS[ticket.urgence]}`}
                </span>
              </div>
              {ticket.date_limite_intervention && (
                <p className="mt-1 text-xs text-gray-400">
                  À effectuer avant {formatDateLimite(ticket.date_limite_intervention)}
                </p>
              )}
              {STATUT_BADGES[ticket.statut] && (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_BADGES[ticket.statut]!.style}`}
                >
                  {STATUT_BADGES[ticket.statut]!.label}
                </span>
              )}
              {ticket.description_manager && (
                <p className="mt-2 truncate text-sm text-gray-700">{ticket.description_manager}</p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
