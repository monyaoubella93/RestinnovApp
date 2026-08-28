import { useEffect, useState } from 'react'
import { fetchTicketsMaintenance, resolveStorageUrl } from '../api'
import type { TicketMaintenance, TicketMaintenanceStatut } from '../types'
import { EN_RETARD_STYLE, formatDateLimite, URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'

const STATUT_LABELS: Record<TicketMaintenanceStatut, string> = {
  ouvert: 'Ouvert',
  assigne: 'Assigné',
  en_cours: 'En cours',
  resolu_en_attente_validation: 'Résolu — en attente de validation',
  a_refaire: 'À refaire',
  resolu: 'Résolu',
}

const STATUT_STYLES: Record<TicketMaintenanceStatut, string> = {
  ouvert: 'bg-amber-100 text-amber-800',
  assigne: 'bg-indigo-100 text-indigo-800',
  en_cours: 'bg-sky-100 text-sky-800',
  resolu_en_attente_validation: 'bg-purple-100 text-purple-800',
  a_refaire: 'bg-red-100 text-red-800',
  resolu: 'bg-green-100 text-green-800',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function HistoriqueTicketCard({ ticket }: { ticket: TicketMaintenance }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="rounded-md border border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-gray-900">
            <span className="truncate">{ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}</span>
            <span className="shrink-0 text-xs font-normal text-gray-400">{ticket.reference}</span>
          </p>
          <p className="truncate text-sm text-gray-700">{ticket.description || 'Aucune description.'}</p>
          <p className="text-xs text-gray-400">{formatDate(ticket.created_at)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ticket.est_en_retard ? EN_RETARD_STYLE : URGENCE_STYLES[ticket.urgence]
            }`}
          >
            {ticket.est_en_retard ? 'En retard' : `Urgence ${URGENCE_LABELS[ticket.urgence]}`}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_STYLES[ticket.statut]}`}>
            {STATUT_LABELS[ticket.statut]}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-gray-100 p-4 pt-3">
          {ticket.date_limite_intervention && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Date limite d'intervention : </span>
              {formatDateLimite(ticket.date_limite_intervention)}
            </p>
          )}

          {ticket.agent && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Agent assigné : </span>
              {ticket.agent.nom}
            </p>
          )}

          {ticket.photo_url && (
            <img
              src={resolveStorageUrl(ticket.photo_url)}
              alt="Photo du problème signalé"
              className="h-32 w-32 rounded-md object-cover"
            />
          )}

          {ticket.photo_apres && (
            <div>
              <p className="text-xs font-medium text-gray-600">Photo après réparation</p>
              <img
                src={resolveStorageUrl(ticket.photo_apres)}
                alt="Photo après réparation"
                className="mt-1 h-32 w-32 rounded-md object-cover"
              />
            </div>
          )}

          {ticket.cout_reparation != null && (
            <p className="text-sm font-medium text-gray-900">Coût : {ticket.cout_reparation} MAD</p>
          )}

          {ticket.refus && ticket.refus.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600">Historique des refus</p>
              <ul className="mt-1 space-y-2">
                {ticket.refus.map((refus) => (
                  <li key={refus.id} className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                    <p className="text-xs text-red-500">
                      {formatDate(refus.created_at)}
                      {refus.manager?.nom && ` · ${refus.manager.nom}`}
                    </p>
                    {refus.motif}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function HistoriqueTicketsSection() {
  const [tickets, setTickets] = useState<TicketMaintenance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statutFilter, setStatutFilter] = useState<TicketMaintenanceStatut | ''>('')

  const load = () => {
    setLoading(true)
    setError(null)
    fetchTicketsMaintenance(statutFilter || undefined)
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger l'historique."))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statutFilter])

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        Historique des tickets
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {tickets.length}
        </span>
      </h2>

      <div className="mt-3 max-w-xs">
        <label htmlFor="historique_statut" className="block text-xs font-medium text-gray-500">
          Statut
        </label>
        <select
          id="historique_statut"
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value as TicketMaintenanceStatut | '')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Tous</option>
          <option value="ouvert">Ouvert</option>
          <option value="assigne">Assigné</option>
          <option value="en_cours">En cours</option>
          <option value="resolu_en_attente_validation">Résolu — en attente de validation</option>
          <option value="a_refaire">À refaire</option>
          <option value="resolu">Résolu</option>
        </select>
      </div>

      {loading && <p className="mt-2 text-sm text-gray-500">Chargement...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Aucun ticket.</p>
      )}

      {!loading && !error && tickets.length > 0 && (
        <ul className="mt-3 space-y-3">
          {tickets.map((ticket) => (
            <HistoriqueTicketCard key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </div>
  )
}
