import { useState } from 'react'
import type { MonTicketMaintenance } from '../types'
import { STATUT_VALIDATION_LABELS, STATUT_VALIDATION_STYLES } from '../utils/statutValidation'
import { URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'
import { TicketDetailAgent } from './TicketDetailAgent'

// Only the two statuts that need a clear, distinct callout in this list --
// the normal "assigne" statut is the agent's regular current work and
// needs no badge, mirroring MesMissionsSection's STATUT_BADGES pattern.
const STATUT_BADGES: Partial<Record<MonTicketMaintenance['statut'], { label: string; style: string }>> = {
  resolu_en_attente_validation: {
    label: STATUT_VALIDATION_LABELS.en_attente,
    style: STATUT_VALIDATION_STYLES.en_attente,
  },
  a_refaire: {
    label: STATUT_VALIDATION_LABELS.refuse,
    style: STATUT_VALIDATION_STYLES.refuse,
  },
}

interface MesTicketsSectionProps {
  tickets: MonTicketMaintenance[]
  loading: boolean
  error: string | null
  heading?: string
  emptyMessage: string
  emptyIcon: string
  onRefresh: () => void
}

export function MesTicketsSection({ tickets, loading, error, heading, emptyMessage, emptyIcon, onRefresh }: MesTicketsSectionProps) {
  // Holds the actual selected ticket object, not just its id: resolving a
  // ticket moves it out of the "assigne" list this screen shows, so deriving
  // the detail view from `tickets` would make the confirmation screen
  // disappear the moment the background refresh completes.
  const [selectedTicket, setSelectedTicket] = useState<MonTicketMaintenance | null>(null)

  if (selectedTicket) {
    return (
      <TicketDetailAgent
        ticket={selectedTicket}
        onBack={() => {
          setSelectedTicket(null)
          onRefresh()
        }}
        onResolu={() => {
          // Stays on the confirmation view -- refresh the underlying list in
          // the background so it's already up to date once the agent goes
          // back to "Mes tickets".
          onRefresh()
        }}
      />
    )
  }

  return (
    <div>
      {heading && <h3 className="text-lg font-bold text-ink">{heading}</h3>}

      {loading && <p className="mt-4 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {!loading && !error && tickets.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-success-bg text-5xl"
          >
            {emptyIcon}
          </div>
          <p className="text-base text-ink-tertiary">{emptyMessage}</p>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => setSelectedTicket(ticket)}
              className="w-full rounded-card-agent-lg border-2 border-border-default bg-surface p-4 text-left hover:border-brand-border hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-ink">
                    {ticket.appartement?.nom ?? 'Appartement'}
                    <span className="ml-2 font-mono text-xs font-normal text-ink-tertiary">{ticket.reference}</span>
                  </p>
                  <p className="truncate text-sm text-ink-tertiary">{ticket.appartement?.adresse}</p>
                </div>
                <span
                  className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${URGENCE_STYLES[ticket.urgence]}`}
                >
                  Urgence {URGENCE_LABELS[ticket.urgence]}
                </span>
              </div>
              {STATUT_BADGES[ticket.statut] && (
                <span
                  className={`mt-1 inline-block rounded-badge px-2 py-0.5 text-xs font-bold ${STATUT_BADGES[ticket.statut]!.style}`}
                >
                  {STATUT_BADGES[ticket.statut]!.label}
                </span>
              )}
              {ticket.description_manager && (
                <p className="mt-2 truncate text-sm text-ink-secondary">{ticket.description_manager}</p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
