import { useEffect, useState } from 'react'
import { downloadRelevePdf, fetchAppartementDetail, fetchAppartementsListe, resolveStorageUrl } from '../api'
import type { AppartementDetail, Appartement } from '../types'
import { AppartementHistoriqueSection } from './AppartementHistoriqueSection'
import { MODE_GESTION_LABELS, MODE_GESTION_STYLES } from './RelevesProprietairesSection'
import { STATUT_LABELS as TICKET_STATUT_LABELS, STATUT_STYLES as TICKET_STATUT_STYLES } from './TicketsMaintenanceSection'
import { RecurrentBadge } from './RecurrentBadge'

interface AppartementsListeSectionProps {
  onNavigateToCreer: () => void
  onEditAppartement: (appartement: Appartement) => void
  onNavigateToCreerSejour?: () => void
  onNavigateToReleves?: () => void
  initialAppartement?: Appartement | null
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMontant(value: number | undefined): string {
  return `${(value ?? 0).toFixed(2)} MAD`
}

const PER_PAGE = 10

const STATUT_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  occupe: 'Occupé',
  en_menage: 'En ménage',
  maintenance: 'Maintenance',
}

const STATUT_STYLES: Record<string, string> = {
  disponible: 'bg-success-bg text-success-text',
  occupe: 'bg-brand-pale text-brand',
  en_menage: 'bg-violet-bg text-violet',
  maintenance: 'bg-danger-bg text-danger',
}

function StatutBadge({ statut }: { statut: string }) {
  return (
    <span className={`rounded-badge px-2 py-0.5 text-xs font-bold ${STATUT_STYLES[statut] ?? 'bg-table-header-bg text-ink-tertiary'}`}>
      {STATUT_LABELS[statut] ?? statut}
    </span>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487a2.06 2.06 0 112.914 2.914L7.5 19.677l-4 1 1-4L16.862 4.487z"
      />
    </svg>
  )
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Aucun'
  return new Date(value).toLocaleDateString('fr-FR')
}

export function AppartementsListeSection({
  onNavigateToCreer,
  onEditAppartement,
  onNavigateToCreerSejour,
  onNavigateToReleves,
  initialAppartement,
}: AppartementsListeSectionProps) {
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)

  const [appartements, setAppartements] = useState<Appartement[]>([])
  // Appartements opened directly from the global header search, which may
  // not be part of the currently loaded page.
  const [extraAppartements, setExtraAppartements] = useState<Appartement[]>(
    initialAppartement ? [initialAppartement] : [],
  )
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAppartementId, setSelectedAppartementId] = useState<number | null>(initialAppartement?.id ?? null)
  const [detailTab, setDetailTab] = useState<'infos' | 'historique'>('infos')

  // The detail screen's extra sections (propriétaire, charges, résumé
  // financier, tickets liés) all come from the single GET
  // /api/appartements/{id} endpoint -- fetched on demand once a row is
  // opened, on top of the already-loaded list row (which renders the
  // header + Ménage section immediately, without waiting on this).
  const [detail, setDetail] = useState<AppartementDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialAppartement) return
    setExtraAppartements((current) =>
      current.some((a) => a.id === initialAppartement.id) ? current : [...current, initialAppartement],
    )
    setSelectedAppartementId(initialAppartement.id)
  }, [initialAppartement])

  useEffect(() => {
    if (!selectedAppartementId) {
      setDetail(null)
      return
    }

    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetchAppartementDetail(selectedAppartementId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err instanceof Error ? err.message : "Impossible de charger le détail de l'appartement.")
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedAppartementId])

  const handleDownloadPdf = async () => {
    if (!selectedAppartementId) return
    setPdfError(null)
    setDownloadingPdf(true)
    try {
      await downloadRelevePdf(selectedAppartementId, currentMonth())
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Impossible de télécharger le PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAppartementsListe({
      search: search || undefined,
      statut: statutFilter || undefined,
      sort_by: 'nom',
      sort_dir: sortDir,
      page,
      per_page: PER_PAGE,
    })
      .then((res) => {
        if (cancelled) return
        setAppartements(res.data)
        setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger les appartements.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [search, statutFilter, sortDir, page])

  const handleSortNom = () => {
    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    setPage(1)
  }

  const selectedAppartement =
    appartements.find((a) => a.id === selectedAppartementId) ??
    extraAppartements.find((a) => a.id === selectedAppartementId) ??
    null

  if (selectedAppartement) {
    // The header and the Ménage section render immediately from the list
    // row already in hand; propriétaire/charges/résumé financier/tickets
    // only appear once the detail fetch resolves.
    const proprietaire = detail?.appartement.proprietaire
    const chargesActives = detail?.appartement.charges_actives ?? []
    const modeGestion = detail?.appartement.mode_gestion

    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedAppartementId(null)}
          className="text-sm font-semibold text-brand-light hover:text-brand"
        >
          ← Retour à la liste
        </button>

        <div className="mt-4 rounded-card-manager border border-border-default bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-start gap-4">
              {selectedAppartement.photo_principale && (
                <img
                  src={resolveStorageUrl(selectedAppartement.photo_principale)}
                  alt={selectedAppartement.nom}
                  className="h-24 w-24 rounded-md object-cover"
                />
              )}
              <div>
                <h3 className="text-lg font-bold text-ink">{selectedAppartement.nom}</h3>
                <p className="text-sm text-ink-secondary">{selectedAppartement.adresse}</p>
                <div className="mt-2">
                  <StatutBadge statut={selectedAppartement.statut} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateToCreerSejour?.()}
                className="rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light"
              >
                Créer un séjour
              </button>
              <button
                type="button"
                onClick={() => onEditAppartement(selectedAppartement)}
                className="rounded-field border border-border-default px-3 py-1.5 text-sm font-semibold text-ink-secondary hover:bg-table-header-bg"
              >
                Modifier l'appartement
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="rounded-field border border-border-default px-3 py-1.5 text-sm font-semibold text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
              >
                {downloadingPdf ? 'Téléchargement...' : 'Télécharger le relevé PDF du mois'}
              </button>
            </div>
          </div>
          {pdfError && <p className="mt-2 text-sm text-danger">{pdfError}</p>}

          {detailLoading && <p className="mt-4 text-sm text-ink-tertiary">Chargement du détail...</p>}
          {detailError && <p className="mt-4 text-sm text-danger">{detailError}</p>}

          {detail && (
            <>
              <section className="mt-4 border-t border-border-default pt-4">
                <h4 className="text-sm font-bold text-ink">Propriétaire</h4>
                {proprietaire ? (
                  <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-tertiary">Nom</dt>
                      <dd className="text-ink">{proprietaire.nom}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Contact</dt>
                      <dd className="text-ink">{proprietaire.telephone ?? proprietaire.email ?? 'Aucun'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Mode de gestion</dt>
                      <dd className="text-ink">
                        {modeGestion && (
                          <span className={`rounded-badge px-2 py-0.5 text-xs font-bold ${MODE_GESTION_STYLES[modeGestion]}`}>
                            {MODE_GESTION_LABELS[modeGestion].toUpperCase()}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">{modeGestion === 'sous_location' ? 'Loyer fixe mensuel' : 'Taux de commission'}</dt>
                      <dd className="font-mono text-ink">
                        {modeGestion === 'sous_location'
                          ? formatMontant(Number(detail.appartement.loyer_fixe_mensuel ?? 0))
                          : `${Number(detail.appartement.taux_commission ?? 0)}%`}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-ink-tertiary">Aucun propriétaire renseigné.</p>
                )}
              </section>

              <section className="mt-4 border-t border-border-default pt-4">
                <h4 className="text-sm font-bold text-ink">Charges et services</h4>
                {chargesActives.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {chargesActives.map((charge) => (
                      <li key={charge.id} className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-table-header-bg px-3 py-2">
                        <span className="text-ink">
                          {charge.nom_service}{' '}
                          <span className="text-ink-tertiary">({charge.frequence === 'annuel' ? 'annuel' : 'mensuel'})</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-ink">{formatMontant(Number(charge.montant))}</span>
                          <span className="rounded-badge bg-surface px-2 py-0.5 text-xs font-semibold text-ink-secondary">
                            {charge.a_charge_de === 'restinnov' ? 'À la charge de RestInnov' : 'À la charge du propriétaire'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-ink-tertiary">Aucune charge active.</p>
                )}
              </section>

              <section className="mt-4 border-t border-border-default pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-ink">Résumé financier (mois en cours)</h4>
                  <button
                    type="button"
                    onClick={() => onNavigateToReleves?.()}
                    className="text-sm font-semibold text-brand-light hover:text-brand"
                  >
                    Voir le relevé complet →
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-field border border-border-default p-3">
                    <p className="text-xs font-semibold text-ink-tertiary">Revenus</p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink">{formatMontant(detail.resume_financier.revenus_bruts)}</p>
                  </div>
                  <div className="rounded-field border border-border-default p-3">
                    <p className="text-xs font-semibold text-ink-tertiary">Frais ménage</p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink">{formatMontant(detail.resume_financier.frais_menage_total)}</p>
                  </div>
                  <div className="rounded-field border border-border-default p-3">
                    <p className="text-xs font-semibold text-ink-tertiary">Frais maintenance</p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink">
                      {formatMontant(detail.resume_financier.frais_maintenance_total)}
                    </p>
                  </div>
                  <div className="rounded-field border border-border-default border-l-[3px] border-l-success p-3">
                    <p className="text-xs font-semibold text-ink-tertiary">Résultat net</p>
                    <p className="mt-1 font-mono text-sm font-bold text-success-text">{formatMontant(detail.resume_financier.resultat_net)}</p>
                  </div>
                </div>
              </section>
            </>
          )}

          <div className="mt-4 flex gap-4 border-b border-border-default">
            <button
              type="button"
              onClick={() => setDetailTab('infos')}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${
                detailTab === 'infos' ? 'border-brand text-brand' : 'border-transparent text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              Infos
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('historique')}
              className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${
                detailTab === 'historique' ? 'border-brand text-brand' : 'border-transparent text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              Historique ménage
            </button>
          </div>

          {detailTab === 'infos' ? (
            <>
              <section>
                <h4 className="mt-4 text-sm font-bold text-ink">Ménage</h4>
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-tertiary">Checklists assignées</dt>
                    <dd className="text-ink">
                      {selectedAppartement.checklist_modeles && selectedAppartement.checklist_modeles.length > 0
                        ? selectedAppartement.checklist_modeles.map((modele) => modele.nom).join(', ')
                        : 'Aucune'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-tertiary">Agent habituel</dt>
                    <dd className="text-ink">{selectedAppartement.agent_habituel?.nom ?? 'Aucun'}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-tertiary">Nombre de séjours</dt>
                    <dd className="text-ink">{selectedAppartement.sejours_count ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-tertiary">Dernier séjour</dt>
                    <dd className="text-ink">{formatDate(selectedAppartement.dernier_sejour)}</dd>
                  </div>
                </dl>
              </section>

              {detail && (
                <section className="mt-4 border-t border-border-default pt-4">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
                    Maintenance
                    {detail.tickets_maintenance_recurrent && <RecurrentBadge appartementId={selectedAppartement.id} />}
                  </h4>
                  {detail.tickets_maintenance.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {detail.tickets_maintenance.map((ticket) => (
                        <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-table-header-bg px-3 py-2">
                          <span className="text-ink">
                            {ticket.reference} <span className="text-ink-tertiary">— {ticket.description || 'Aucune description.'}</span>
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUT_STYLES[ticket.statut]}`}>
                            {TICKET_STATUT_LABELS[ticket.statut]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-ink-tertiary">Aucun ticket de maintenance.</p>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="mt-4">
              <AppartementHistoriqueSection appartementId={selectedAppartement.id} />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-[-0.02em] text-ink">Appartements</h3>
          <p className="text-[13px] text-ink-tertiary">{meta.total} appartements trouvés</p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCreer}
          className="rounded-field bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-light"
        >
          + Nouvel appartement
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-card-manager border border-border-default bg-surface p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="appartements_search" className="block text-xs font-semibold text-ink-secondary">
            Recherche
          </label>
          <input
            id="appartements_search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Nom ou adresse"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="appartements_statut" className="block text-xs font-semibold text-ink-secondary">
            Statut
          </label>
          <select
            id="appartements_statut"
            value={statutFilter}
            onChange={(e) => {
              setStatutFilter(e.target.value)
              setPage(1)
            }}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Tous</option>
            <option value="disponible">Disponible</option>
            <option value="occupe">Occupé</option>
            <option value="en_menage">En ménage</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && !error && appartements.length === 0 && (
        <p className="text-sm text-ink-tertiary">Aucun appartement trouvé.</p>
      )}

      {!loading && !error && appartements.length > 0 && (
        <div className="overflow-x-auto rounded-card-manager border border-border-default bg-surface">
          <table className="min-w-full divide-y divide-border-default text-sm">
            <thead>
              <tr className="bg-table-header-bg text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-tertiary-2">
                <th className="px-4 py-2">Photo</th>
                <th className="px-4 py-2">
                  <button type="button" onClick={handleSortNom} className="flex items-center">
                    Nom
                    <span className="ml-1 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  </button>
                </th>
                <th className="px-4 py-2">Adresse</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Checklist</th>
                <th className="px-4 py-2">Agent habituel</th>
                <th className="px-4 py-2">Nb séjours</th>
                <th className="px-4 py-2">Dernier séjour</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {appartements.map((appartement) => (
                <tr key={appartement.id}>
                  <td className="px-4 py-3">
                    {appartement.photo_principale ? (
                      <img
                        src={resolveStorageUrl(appartement.photo_principale)}
                        alt={appartement.nom}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-table-header-bg text-xs text-ink-disabled">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{appartement.nom}</td>
                  <td className="px-4 py-3 text-ink-secondary">{appartement.adresse}</td>
                  <td className="px-4 py-3">
                    <StatutBadge statut={appartement.statut} />
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {appartement.checklist_modeles && appartement.checklist_modeles.length > 0
                      ? appartement.checklist_modeles.map((modele) => modele.nom).join(', ')
                      : 'Aucune'}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{appartement.agent_habituel?.nom ?? 'Aucun'}</td>
                  <td className="px-4 py-3 font-mono text-ink-secondary">{appartement.sejours_count ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-ink-secondary">{formatDate(appartement.dernier_sejour)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Modifier l'appartement ${appartement.nom}`}
                        onClick={() => onEditAppartement(appartement)}
                        className="text-ink-tertiary hover:text-brand"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        aria-label={`Voir le détail de l'appartement ${appartement.nom}`}
                        onClick={() => {
                          setSelectedAppartementId(appartement.id)
                          setDetailTab('infos')
                        }}
                        className="text-ink-tertiary hover:text-brand"
                      >
                        <EyeIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && meta.last_page > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={meta.current_page <= 1}
            className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
          >
            Précédent
          </button>
          <div className="flex gap-1">
            {Array.from({ length: meta.last_page }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === meta.current_page ? 'page' : undefined}
                className={`h-8 w-8 rounded-field text-sm font-medium ${
                  p === meta.current_page ? 'bg-brand text-white' : 'text-ink-secondary hover:bg-table-header-bg'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
            disabled={meta.current_page >= meta.last_page}
            className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}
