import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchMesTicketsMaintenanceHistorique, resolveStorageUrl } from '../api'
import type { HistoriqueTicketAgent } from '../types'
import { URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'

function HistoriqueTicketRow({ ticket }: { ticket: HistoriqueTicketAgent }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="rounded-card-agent-lg border-2 border-border-default bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-[80px] w-full items-center gap-4 p-4 text-start"
      >
        <div
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-success-bg text-3xl"
        >
          ✅
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-ink">
            {ticket.appartement?.nom ?? t('common.apartmentFallback')}
            <span className="ms-2 font-mono text-xs font-normal text-ink-tertiary">{ticket.reference}</span>
          </p>
          <p className="truncate text-sm text-ink-tertiary">{ticket.appartement?.adresse}</p>
        </div>
        <span className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${URGENCE_STYLES[ticket.urgence]}`}>
          {t('maintenance.urgenceLabel', { label: URGENCE_LABELS[ticket.urgence] })}
        </span>
        <span aria-hidden="true" className="shrink-0 text-xl text-ink-disabled">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border-light px-4 py-3 text-sm">
          {ticket.description_manager && <p className="text-ink-secondary">{ticket.description_manager}</p>}
          {ticket.photo_apres && (
            <img
              src={resolveStorageUrl(ticket.photo_apres)}
              alt={t('maintenance.historique.photoApres')}
              className="h-24 w-24 rounded-lg object-cover"
            />
          )}
          {ticket.cout_reparation != null && (
            <p className="font-mono font-bold text-ink">
              {t('maintenance.historique.cout', { montant: ticket.cout_reparation })}
            </p>
          )}
          {ticket.note_resolution && <p className="text-ink-secondary">{ticket.note_resolution}</p>}
          {ticket.messages_agent.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-secondary">{t('maintenance.detail.message.historyTitle')}</p>
              <ul className="mt-1 space-y-1">
                {ticket.messages_agent.map((message) => (
                  <li key={message.id} className="rounded-field bg-table-header-bg p-2 text-ink-secondary">
                    {message.note && <p>{message.note}</p>}
                    {message.audio_url && (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls src={resolveStorageUrl(message.audio_url)} className="mt-1 w-full" />
                    )}
                    {message.photo_url && (
                      <img
                        src={resolveStorageUrl(message.photo_url)}
                        alt={t('maintenance.detail.message.photoAlt')}
                        className="mt-1 h-16 w-16 rounded object-cover"
                      />
                    )}
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

export function HistoriqueTicketsAgentSection() {
  const { t } = useTranslation()
  const [tickets, setTickets] = useState<HistoriqueTicketAgent[]>([])
  const [appartementOptions, setAppartementOptions] = useState<{ id: number; nom: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [appartementFilter, setAppartementFilter] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  // The appartement dropdown always lists every appartement this agent has
  // ever resolved a ticket for, regardless of the current search/date
  // filters -- fetched once, unfiltered, so picking a filter never makes
  // options disappear out from under the agent.
  useEffect(() => {
    fetchMesTicketsMaintenanceHistorique()
      .then((all) => {
        const uniques = new Map<number, string>()
        all.forEach((ticket) => {
          if (ticket.appartement) uniques.set(ticket.appartement.id, ticket.appartement.nom)
        })
        setAppartementOptions(Array.from(uniques, ([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom)))
      })
      .catch(() => {
        // Non-critical: the dropdown just stays empty, the rest of the screen still works.
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchMesTicketsMaintenanceHistorique({
      appartementId: appartementFilter ? Number(appartementFilter) : undefined,
      dateDebut: dateDebut || undefined,
      dateFin: dateFin || undefined,
      search: search || undefined,
    })
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : t('maintenance.historique.error')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, appartementFilter, dateDebut, dateFin])

  return (
    <div>
      <h3 className="text-lg font-bold text-ink">{t('maintenance.historique.title')}</h3>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-card-manager border border-border-default bg-table-header-bg p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="historique_recherche" className="block text-xs font-semibold text-ink-secondary">
            {t('maintenance.historique.searchLabel')}
          </label>
          <input
            id="historique_recherche"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('maintenance.historique.searchPlaceholder')}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="historique_appartement" className="block text-xs font-semibold text-ink-secondary">
            {t('maintenance.historique.appartementLabel')}
          </label>
          <select
            id="historique_appartement"
            value={appartementFilter}
            onChange={(e) => setAppartementFilter(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">{t('maintenance.historique.appartementAll')}</option>
            {appartementOptions.map((appartement) => (
              <option key={appartement.id} value={appartement.id}>
                {appartement.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="historique_date_debut" className="block text-xs font-semibold text-ink-secondary">
            {t('maintenance.historique.dateDebutLabel')}
          </label>
          <input
            id="historique_date_debut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="historique_date_fin" className="block text-xs font-semibold text-ink-secondary">
            {t('maintenance.historique.dateFinLabel')}
          </label>
          <input
            id="historique_date_fin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-ink-tertiary">{t('common.loading')}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {!loading && !error && tickets.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-table-header-bg text-5xl"
          >
            🗂️
          </div>
          <p className="text-base text-ink-tertiary">{t('maintenance.historique.empty')}</p>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {tickets.map((ticket) => (
          <HistoriqueTicketRow key={ticket.id} ticket={ticket} />
        ))}
      </ul>
    </div>
  )
}
