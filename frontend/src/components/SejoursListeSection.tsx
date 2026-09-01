import { useEffect, useState } from 'react'
import {
  annulerSejour,
  checkoutSejour,
  createFraisMaintenance,
  deleteFraisMaintenance,
  detacherProduitUtilise,
  fetchSejour,
  fetchSejours,
  refuserMissionMenage,
  rejeterProduitSignale,
  signalerProduit,
  updateMissionMenageProduits,
  updateProduitUtilise,
  validerMissionMenage,
  validerProduitSignale,
  type NewFraisMaintenanceInput,
  type RefuserInput,
  type SignalerProduitInput,
  type UpdateMissionMenageProduitsInput,
  type UpdateProduitUtiliseInput,
  type ValiderProduitSignaleInput,
} from '../api'
import type { Appartement, PlateformeOrigine, ProduitCatalogue, Sejour, SejourStatut } from '../types'
import { ConfirmModal } from './ConfirmModal'
import { SejourCard } from './SejourCard'

interface SejoursListeSectionProps {
  appartements: Appartement[]
  catalogue: ProduitCatalogue[]
  onNavigateToCreer: () => void
  onEditSejour: (sejour: Sejour) => void
  initialStatutFilter?: SejourStatut | ''
  initialSejourId?: number | null
}

const PER_PAGE = 10

const STATUT_FILTER_OPTIONS: { value: SejourStatut | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'a_venir', label: 'À venir' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'termine', label: 'Checkout effectué' },
  { value: 'annule', label: 'Annulé' },
]

const STATUT_BADGE_LABELS: Record<SejourStatut, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
  annule: 'Annulé',
}

const STATUT_BADGE_STYLES: Record<SejourStatut, string> = {
  a_venir: 'bg-brand-pale text-brand',
  en_cours: 'bg-warning-bg text-warning-text',
  termine: 'bg-table-header-bg text-ink-tertiary',
  annule: 'bg-danger-bg text-danger',
}

const PLATEFORME_LABELS: Record<PlateformeOrigine, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking',
  direct: 'Direct',
  autre: 'Autre',
}

const PLATEFORME_STYLES: Record<PlateformeOrigine, string> = {
  airbnb: 'bg-violet-bg text-violet',
  booking: 'bg-brand-pale text-brand',
  direct: 'bg-success-bg text-success-text',
  autre: 'bg-table-header-bg text-ink-tertiary',
}

function formatMontant(value: string | number | null): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(num)) return '—'
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-ink-disabled">↕</span>
  return <span className="ml-1 text-brand">{dir === 'asc' ? '↑' : '↓'}</span>
}

export function SejoursListeSection({
  appartements,
  catalogue,
  onNavigateToCreer,
  onEditSejour,
  initialStatutFilter,
  initialSejourId,
}: SejoursListeSectionProps) {
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<SejourStatut | ''>(initialStatutFilter ?? '')
  const [appartementFilter, setAppartementFilter] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [sortBy, setSortBy] = useState<'date_arrivee' | 'date_depart'>('date_arrivee')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const [sejours, setSejours] = useState<Sejour[]>([])
  // Sejours fetched individually (e.g. opened directly from the Dashboard's
  // "Séjours récents"), which may not be part of the currently loaded page.
  const [extraSejours, setExtraSejours] = useState<Sejour[]>([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSejourId, setSelectedSejourId] = useState<number | null>(initialSejourId ?? null)
  const [initialDetailLoading, setInitialDetailLoading] = useState(initialSejourId != null)
  const [annulerSejourId, setAnnulerSejourId] = useState<number | null>(null)

  const applySejourUpdate = (predicate: (sejour: Sejour) => boolean, updater: (sejour: Sejour) => Sejour) => {
    setSejours((current) => current.map((s) => (predicate(s) ? updater(s) : s)))
    setExtraSejours((current) => current.map((s) => (predicate(s) ? updater(s) : s)))
  }

  useEffect(() => {
    if (initialSejourId == null) return

    let cancelled = false
    fetchSejour(initialSejourId)
      .then((sejour) => {
        if (cancelled) return
        setExtraSejours((current) => (current.some((s) => s.id === sejour.id) ? current : [...current, sejour]))
      })
      .catch(() => {
        // The detail view simply won't have anything to show; the normal
        // list below is unaffected.
      })
      .finally(() => {
        if (!cancelled) setInitialDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Only ever runs for the id this component was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSejours({
      search: search || undefined,
      statut: statutFilter || undefined,
      appartement_id: appartementFilter ? Number(appartementFilter) : undefined,
      date_debut: dateDebut || undefined,
      date_fin: dateFin || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      per_page: PER_PAGE,
    })
      .then((res) => {
        if (cancelled) return
        setSejours(res.data)
        setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger les séjours.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [search, statutFilter, appartementFilter, dateDebut, dateFin, sortBy, sortDir, page])

  const handleSort = (column: 'date_arrivee' | 'date_depart') => {
    if (sortBy === column) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
    setPage(1)
  }

  const handleCheckout = async (id: number) => {
    const { sejour: updated, mission_menage } = await checkoutSejour(id)
    applySejourUpdate(
      (s) => s.id === id,
      (s) => ({ ...s, statut: updated.statut, mission_menage }),
    )
  }

  const handleAnnuler = async (id: number) => {
    const updated = await annulerSejour(id)
    applySejourUpdate(
      (s) => s.id === id,
      (s) => ({ ...s, statut: updated.statut }),
    )
  }

  const handleValiderMission = async (missionMenageId: number) => {
    const updated = await validerMissionMenage(missionMenageId)
    applySejourUpdate(
      (s) => s.mission_menage?.id === missionMenageId,
      (s) => ({ ...s, mission_menage: updated }),
    )
  }

  const handleRefuserMission = async (missionMenageId: number, input: RefuserInput) => {
    const updated = await refuserMissionMenage(missionMenageId, input)
    applySejourUpdate(
      (s) => s.mission_menage?.id === missionMenageId,
      (s) => ({ ...s, mission_menage: updated }),
    )
  }

  const handleUpdateMissionProduits = async (missionMenageId: number, input: UpdateMissionMenageProduitsInput) => {
    const updated = await updateMissionMenageProduits(missionMenageId, input)
    applySejourUpdate(
      (s) => s.mission_menage?.id === missionMenageId,
      (s) => ({ ...s, mission_menage: updated }),
    )
  }

  const handleUpdateProduitUtilise = async (missionMenageId: number, produitId: number, input: UpdateProduitUtiliseInput) => {
    const updated = await updateProduitUtilise(missionMenageId, produitId, input)
    applySejourUpdate(
      (s) => s.mission_menage?.id === missionMenageId,
      (s) => ({ ...s, mission_menage: updated }),
    )
  }

  const handleDetacherProduit = async (missionMenageId: number, produitId: number) => {
    const updated = await detacherProduitUtilise(missionMenageId, produitId)
    applySejourUpdate(
      (s) => s.mission_menage?.id === missionMenageId,
      (s) => ({ ...s, mission_menage: updated }),
    )
  }

  const handleSignalerProduit = async (missionMenageId: number, input: SignalerProduitInput) => {
    await signalerProduit(missionMenageId, input)
  }

  const handleValiderProduitSignale = async (id: number, input: ValiderProduitSignaleInput) => {
    const updated = await validerProduitSignale(id, input)
    applySejourUpdate(
      (s) => s.mission_menage?.produits_signales?.some((p) => p.id === id) ?? false,
      (s) => ({
        ...s,
        mission_menage: s.mission_menage
          ? {
              ...s.mission_menage,
              produits_signales: (s.mission_menage.produits_signales ?? []).map((p) => (p.id === id ? updated : p)),
            }
          : s.mission_menage,
      }),
    )
  }

  const handleRejeterProduitSignale = async (id: number) => {
    const updated = await rejeterProduitSignale(id)
    applySejourUpdate(
      (s) => s.mission_menage?.produits_signales?.some((p) => p.id === id) ?? false,
      (s) => ({
        ...s,
        mission_menage: s.mission_menage
          ? {
              ...s.mission_menage,
              produits_signales: (s.mission_menage.produits_signales ?? []).map((p) => (p.id === id ? updated : p)),
            }
          : s.mission_menage,
      }),
    )
  }

  const handleAddFraisMaintenance = async (sejourId: number, input: NewFraisMaintenanceInput) => {
    const created = await createFraisMaintenance(sejourId, input)
    applySejourUpdate(
      (s) => s.id === sejourId,
      (s) => ({ ...s, frais_maintenance: [...(s.frais_maintenance ?? []), created] }),
    )
  }

  const handleDeleteFraisMaintenance = async (id: number) => {
    await deleteFraisMaintenance(id)
    applySejourUpdate(
      () => true,
      (s) => ({ ...s, frais_maintenance: (s.frais_maintenance ?? []).filter((f) => f.id !== id) }),
    )
  }

  const selectedSejour =
    sejours.find((s) => s.id === selectedSejourId) ?? extraSejours.find((s) => s.id === selectedSejourId) ?? null

  if (initialDetailLoading) {
    return <p className="text-sm text-gray-500">Chargement du séjour...</p>
  }

  if (selectedSejour) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedSejourId(null)}
          className="text-sm font-semibold text-brand-light hover:text-brand"
        >
          ← Retour à la liste
        </button>
        <ul className="mt-4 space-y-3">
          <SejourCard
            sejour={selectedSejour}
            catalogue={catalogue}
            onCheckout={handleCheckout}
            onAnnuler={handleAnnuler}
            onValiderMission={handleValiderMission}
            onRefuserMission={handleRefuserMission}
            onUpdateMissionProduits={handleUpdateMissionProduits}
            onUpdateProduitUtilise={handleUpdateProduitUtilise}
            onDetacherProduit={handleDetacherProduit}
            onSignalerProduit={handleSignalerProduit}
            onValiderProduitSignale={handleValiderProduitSignale}
            onRejeterProduitSignale={handleRejeterProduitSignale}
            onAddFraisMaintenance={handleAddFraisMaintenance}
            onDeleteFraisMaintenance={handleDeleteFraisMaintenance}
          />
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-[-0.02em] text-ink">Séjours</h3>
          <p className="text-[13px] text-ink-tertiary">{meta.total} séjours trouvés</p>
        </div>
        <button
          type="button"
          onClick={onNavigateToCreer}
          className="rounded-field bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-light"
        >
          + Nouveau séjour
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-card-manager border border-border-default bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="sejours_search" className="block text-xs font-semibold text-ink-secondary">
            Recherche
          </label>
          <input
            id="sejours_search"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Voyageur ou appartement"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="sejours_statut" className="block text-xs font-semibold text-ink-secondary">
            Statut
          </label>
          <select
            id="sejours_statut"
            value={statutFilter}
            onChange={(e) => {
              setStatutFilter(e.target.value as SejourStatut | '')
              setPage(1)
            }}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            {STATUT_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sejours_appartement" className="block text-xs font-semibold text-ink-secondary">
            Appartement
          </label>
          <select
            id="sejours_appartement"
            value={appartementFilter}
            onChange={(e) => {
              setAppartementFilter(e.target.value)
              setPage(1)
            }}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Tous</option>
            {appartements.map((appartement) => (
              <option key={appartement.id} value={appartement.id}>
                {appartement.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sejours_date_debut" className="block text-xs font-semibold text-ink-secondary">
            Arrivée du
          </label>
          <input
            id="sejours_date_debut"
            type="date"
            value={dateDebut}
            onChange={(e) => {
              setDateDebut(e.target.value)
              setPage(1)
            }}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="sejours_date_fin" className="block text-xs font-semibold text-ink-secondary">
            Arrivée au
          </label>
          <input
            id="sejours_date_fin"
            type="date"
            value={dateFin}
            onChange={(e) => {
              setDateFin(e.target.value)
              setPage(1)
            }}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && !error && sejours.length === 0 && (
        <p className="text-sm text-ink-tertiary">Aucun séjour trouvé.</p>
      )}

      {!loading && !error && sejours.length > 0 && (
        <div className="overflow-x-auto rounded-card-manager border border-border-default bg-surface">
          <table className="min-w-full divide-y divide-border-default text-sm">
            <thead>
              <tr className="bg-table-header-bg text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-tertiary-2">
                <th className="px-4 py-2.5">Référence</th>
                <th className="px-4 py-2.5">Voyageur principal</th>
                <th className="px-4 py-2.5">Appartement</th>
                <th className="px-4 py-2.5">
                  <button type="button" onClick={() => handleSort('date_arrivee')} className="flex items-center">
                    Arrivée
                    <SortArrow active={sortBy === 'date_arrivee'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2.5">
                  <button type="button" onClick={() => handleSort('date_depart')} className="flex items-center">
                    Départ
                    <SortArrow active={sortBy === 'date_depart'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2.5">Nb voyageurs</th>
                <th className="px-4 py-2.5 text-right">Montant</th>
                <th className="px-4 py-2.5">Plateforme</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {sejours.map((sejour) => (
                <tr key={sejour.id}>
                  <td
                    className="px-4 py-3 font-mono text-ink-tertiary"
                    data-testid={`sejour-reference-${sejour.id}`}
                  >
                    {sejour.reference}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-pale text-[11px] font-bold text-brand">
                        {initiales(sejour.nom_voyageur)}
                      </span>
                      <span className="font-semibold text-ink">{sejour.nom_voyageur}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    {sejour.appartement?.nom ?? `Appartement #${sejour.appartement_id}`}
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-secondary">{sejour.date_arrivee}</td>
                  <td className="px-4 py-3 font-mono text-ink-secondary">{sejour.date_depart}</td>
                  <td className="px-4 py-3 text-ink-secondary">{sejour.voyageurs_count ?? sejour.voyageurs?.length ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-ink">
                    {formatMontant(sejour.montant_mad)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-badge px-2 py-0.5 text-xs font-medium ${PLATEFORME_STYLES[sejour.plateforme_origine]}`}
                    >
                      {PLATEFORME_LABELS[sejour.plateforme_origine]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-badge px-2 py-0.5 text-xs font-bold ${STATUT_BADGE_STYLES[sejour.statut]}`}
                    >
                      {STATUT_BADGE_LABELS[sejour.statut]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Modifier le séjour de ${sejour.nom_voyageur}`}
                        title={
                          sejour.statut === 'termine'
                            ? 'Ce séjour est terminé et ne peut plus être modifié.'
                            : sejour.statut === 'annule'
                              ? 'Ce séjour est annulé et ne peut plus être modifié.'
                              : undefined
                        }
                        disabled={sejour.statut === 'termine' || sejour.statut === 'annule'}
                        onClick={() => onEditSejour(sejour)}
                        className="text-ink-tertiary hover:text-brand disabled:cursor-not-allowed disabled:text-ink-disabled disabled:hover:text-ink-disabled"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        aria-label={`Voir le détail du séjour de ${sejour.nom_voyageur}`}
                        onClick={() => setSelectedSejourId(sejour.id)}
                        className="text-ink-tertiary hover:text-brand"
                      >
                        <EyeIcon />
                      </button>
                      {sejour.statut === 'a_venir' && (
                        <button
                          type="button"
                          aria-label={`Annuler le séjour de ${sejour.nom_voyageur}`}
                          onClick={() => setAnnulerSejourId(sejour.id)}
                          className="text-ink-tertiary hover:text-danger"
                        >
                          <XIcon />
                        </button>
                      )}
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

      {annulerSejourId != null && (
        <ConfirmModal
          title="Annuler ce séjour"
          message="Êtes-vous sûr de vouloir annuler ce séjour ?"
          confirmLabel="Annuler le séjour"
          onCancel={() => setAnnulerSejourId(null)}
          onConfirm={async () => {
            await handleAnnuler(annulerSejourId)
            setAnnulerSejourId(null)
          }}
        />
      )}
    </div>
  )
}
