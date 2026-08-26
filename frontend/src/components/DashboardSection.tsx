import { useState } from 'react'
import type { DashboardData, SejourStatut } from '../types'
import { URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'
import { RelevesProprietairesSection } from './RelevesProprietairesSection'

interface DashboardSectionProps {
  data: DashboardData | null
  loading: boolean
  error: string | null
  onNavigateToAppartements?: () => void
  onNavigateToSejour?: (sejourId: number) => void
  onNavigateToSejoursListe?: (statut?: SejourStatut) => void
  onCheckout?: (sejourId: number) => Promise<void>
  onNavigateToTicketsMaintenance?: () => void
  onNavigateToResolutionsAValider?: () => void
}

// Canonical séjour statut labels/colors, kept identical to SejourCard.tsx
// and SejoursListeSection.tsx so badges read the same everywhere.
const STATUT_LABELS: Record<SejourStatut, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
  annule: 'Annulé',
}

const STATUT_BADGE_STYLES: Record<SejourStatut, string> = {
  a_venir: 'bg-brand-pale text-brand',
  en_cours: 'bg-warning-bg text-warning-text',
  termine: 'bg-success-bg text-success-text',
  annule: 'bg-danger-bg text-danger',
}

const STATUT_CARD_STYLES: Record<SejourStatut, string> = {
  a_venir: 'border-brand-border bg-brand-pale text-brand hover:bg-brand-pale/70',
  en_cours: 'border-warning-border bg-warning-bg text-warning-text hover:bg-warning-bg/70',
  termine: 'border-success-border bg-success-bg text-success-text hover:bg-success-bg/70',
  annule: 'border-danger-border bg-danger-bg text-danger hover:bg-danger-bg/70',
}

// Appartement statut labels/colors, kept identical to AppartementsListeSection.tsx.
const APPARTEMENT_STATUT_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  occupe: 'Occupé',
  en_menage: 'En ménage',
  maintenance: 'Maintenance',
}

const APPARTEMENT_STATUT_STYLES: Record<string, string> = {
  disponible: 'bg-success-bg text-success-text',
  occupe: 'bg-brand-pale text-brand',
  en_menage: 'bg-violet-bg text-violet',
  maintenance: 'bg-danger-bg text-danger',
}

const STATUT_ORDER: (keyof DashboardData['sejours_par_statut'])[] = ['a_venir', 'en_cours', 'termine']

const DONUT_RADIUS = 54
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

function formatMad(value: number): string {
  return `${value.toFixed(2)} MAD`
}

function formatDate(value: string | null): string {
  if (!value) return 'Aucun'
  return new Date(value).toLocaleDateString('fr-FR')
}

function SuitcaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-9 0h10a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2zM4 12h16"
      />
    </svg>
  )
}

interface DepartsAujourdhuiBannerProps {
  departs: DashboardData['departs_aujourdhui']
  onCheckout?: (sejourId: number) => Promise<void>
}

function DepartsAujourdhuiBanner({ departs, onCheckout }: DepartsAujourdhuiBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const [checkingOutId, setCheckingOutId] = useState<number | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  if (departs.length === 0) return null

  const handleCheckout = async (sejourId: number) => {
    setCheckoutError(null)
    setCheckingOutId(sejourId)
    try {
      await onCheckout?.(sejourId)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setCheckingOutId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-card-manager border border-warning-border bg-warning-bg">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-border text-warning-text">
            <SuitcaseIcon className="h-5 w-5" />
          </span>
          <span className="font-semibold text-warning-text">
            {departs.length} départ{departs.length > 1 ? 's' : ''} prévu{departs.length > 1 ? 's' : ''} aujourd'hui
          </span>
        </span>
        <span className="text-warning-text">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ul className="divide-y divide-warning-border border-t border-warning-border bg-surface">
          {departs.map((depart) => (
            <li key={depart.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-disabled">{depart.reference}</p>
                <p className="font-medium text-ink">{depart.voyageur_principal}</p>
                <p className="text-sm text-ink-tertiary">
                  {depart.appartement?.nom ?? 'Appartement supprimé'}
                  {depart.telephone_voyageur ? ` · ${depart.telephone_voyageur}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCheckout(depart.id)}
                disabled={checkingOutId === depart.id}
                className="shrink-0 rounded-field bg-success px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {checkingOutId === depart.id ? 'Confirmation...' : 'Confirmer le checkout'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {checkoutError && (
        <p className="border-t border-warning-border bg-surface px-4 py-2 text-sm text-danger">{checkoutError}</p>
      )}
    </div>
  )
}

export function DashboardSection({
  data,
  loading,
  error,
  onNavigateToAppartements,
  onNavigateToSejour,
  onNavigateToSejoursListe,
  onCheckout,
  onNavigateToTicketsMaintenance,
  onNavigateToResolutionsAValider,
}: DashboardSectionProps) {
  if (loading) {
    return <p className="text-sm text-ink-tertiary">Chargement du dashboard...</p>
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  if (!data) {
    return null
  }

  const totalATraiter = data.problemes_signales.length + data.menages_a_valider.length + data.resolutions_a_valider.length

  const chargesTotal = data.frais_menage_totaux + data.frais_maintenance_totaux
  const menageLength = chargesTotal > 0 ? (data.frais_menage_totaux / chargesTotal) * DONUT_CIRCUMFERENCE : 0
  const maintenanceLength = chargesTotal > 0 ? (data.frais_maintenance_totaux / chargesTotal) * DONUT_CIRCUMFERENCE : 0
  const menagePct = chargesTotal > 0 ? Math.round((data.frais_menage_totaux / chargesTotal) * 100) : 0
  const maintenancePct = chargesTotal > 0 ? 100 - menagePct : 0

  return (
    <div className="space-y-6">
      <DepartsAujourdhuiBanner departs={data.departs_aujourdhui} onCheckout={onCheckout} />

      <section className="overflow-hidden rounded-card-manager border border-border-default bg-surface">
        <div className="flex items-center gap-2.5 border-b border-border-light px-[18px] py-3.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
          <h3 className="text-[15px] font-bold tracking-[-0.01em] text-ink">À traiter aujourd'hui</h3>
          <span className="rounded-badge bg-danger-bg px-2 py-0.5 font-mono text-xs font-bold text-danger">
            {totalATraiter}
          </span>
          <span className="ml-auto hidden text-[13px] text-ink-tertiary sm:inline">
            Rien ne part en production sans votre validation
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          <div className="border-b border-border-light px-[18px] py-4 sm:border-b-0 sm:border-r">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-warning-text">Ménages à valider</span>
              <span className="font-mono text-xs font-bold text-warning-text">{data.menages_a_valider.length}</span>
            </div>
            {data.menages_a_valider.length === 0 ? (
              <p className="text-sm text-ink-tertiary">Aucun ménage en attente.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.menages_a_valider.map((menage) => (
                  <li key={menage.id}>
                    <button
                      type="button"
                      onClick={() => onNavigateToSejour?.(menage.sejour_id)}
                      className="flex w-full items-center gap-2.5 rounded-[10px] border border-warning-border bg-[#FDF9F2] px-2.5 py-2.5 text-left transition-colors hover:bg-warning-bg"
                    >
                      <span className="h-9 w-9 shrink-0 rounded-lg bg-warning-border" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {menage.appartement?.adresse ?? 'Appartement supprimé'}
                        </p>
                        <p className="truncate text-xs text-ink-tertiary-2">{menage.nom_voyageur}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-b border-border-light px-[18px] py-4 sm:border-b-0 sm:border-r">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-danger">Urgences maintenance</span>
              <span className="font-mono text-xs font-bold text-danger">{data.problemes_signales.length}</span>
            </div>
            {data.problemes_signales.length === 0 ? (
              <p className="text-sm text-ink-tertiary">Aucun problème signalé.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.problemes_signales.map((probleme) => (
                  <li key={probleme.id}>
                    <button
                      type="button"
                      onClick={() => onNavigateToTicketsMaintenance?.()}
                      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-danger-border bg-[#FDF4F3] px-2.5 py-2.5 text-left transition-colors hover:bg-danger-bg"
                    >
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {probleme.appartement?.adresse ?? 'Appartement supprimé'}
                      </p>
                      <span
                        className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${URGENCE_STYLES[probleme.urgence]}`}
                      >
                        {URGENCE_LABELS[probleme.urgence]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-[18px] py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-violet">Résolutions à valider</span>
              <span className="font-mono text-xs font-bold text-violet">{data.resolutions_a_valider.length}</span>
            </div>
            {data.resolutions_a_valider.length === 0 ? (
              <p className="text-sm text-ink-tertiary">Aucune résolution en attente.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.resolutions_a_valider.map((resolution) => (
                  <li key={resolution.id}>
                    <button
                      type="button"
                      onClick={() => onNavigateToResolutionsAValider?.()}
                      className="flex w-full items-center gap-2.5 rounded-[10px] border border-violet-border bg-[#F8F5FD] px-2.5 py-2.5 text-left transition-colors hover:bg-violet-bg"
                    >
                      <span className="h-9 w-9 shrink-0 rounded-lg bg-violet-border" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {resolution.appartement?.adresse ?? 'Appartement supprimé'}
                        </p>
                        {resolution.cout_reparation != null && (
                          <p className="truncate text-xs text-ink-tertiary-2">{resolution.cout_reparation} MAD</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card-manager border border-border-default bg-surface p-4">
          <p className="text-xs font-semibold text-ink-tertiary">Revenus totaux</p>
          <p
            className="mt-2 font-mono text-[27px] font-bold tracking-[-0.03em] text-ink"
            data-testid="dashboard-revenus-totaux"
          >
            {formatMad(data.revenus_totaux)}
          </p>
        </div>

        <div className="rounded-card-manager border border-border-default bg-surface p-4">
          <p className="text-xs font-semibold text-ink-tertiary">Frais de ménage totaux</p>
          <p
            className="mt-2 font-mono text-[27px] font-bold tracking-[-0.03em] text-ink"
            data-testid="dashboard-frais-menage-totaux"
          >
            {formatMad(data.frais_menage_totaux)}
          </p>
        </div>

        <div className="rounded-card-manager border border-border-default bg-surface p-4">
          <p className="text-xs font-semibold text-ink-tertiary">Frais de maintenance totaux</p>
          <p
            className="mt-2 font-mono text-[27px] font-bold tracking-[-0.03em] text-ink"
            data-testid="dashboard-frais-maintenance-totaux"
          >
            {formatMad(data.frais_maintenance_totaux)}
          </p>
        </div>

        <div className="rounded-card-manager border border-marine bg-marine p-4">
          <p className="text-xs font-semibold text-[#93A3BE]">Résultat net</p>
          <p
            className="mt-2 font-mono text-[27px] font-bold tracking-[-0.03em] text-white"
            data-testid="dashboard-resultat-net"
          >
            {formatMad(data.resultat_net)}
          </p>
          <p className="mt-2 text-xs text-[#93A3BE]">Hors commission propriétaire (non incluse pour le moment)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card-manager border border-border-default bg-surface p-6">
          <h3 className="text-sm font-bold text-ink">Séjours par statut</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STATUT_ORDER.map((statut) => (
              <button
                key={statut}
                type="button"
                onClick={() => onNavigateToSejoursListe?.(statut)}
                className={`rounded-[10px] border p-4 text-left transition-colors ${STATUT_CARD_STYLES[statut]}`}
              >
                <p className="text-2xl font-bold">{data.sejours_par_statut[statut]}</p>
                <p className="text-sm font-medium">{STATUT_LABELS[statut]}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-card-manager border border-border-default bg-surface p-[18px]">
          <h3 className="text-sm font-bold text-ink">Répartition des charges</h3>
          <div className="mt-2 flex items-center gap-[18px]">
            <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
              <g transform="rotate(-90 70 70)" fill="none" strokeWidth={17}>
                <circle cx="70" cy="70" r={DONUT_RADIUS} className="stroke-border-light" />
                {chargesTotal > 0 && (
                  <>
                    <circle
                      cx="70"
                      cy="70"
                      r={DONUT_RADIUS}
                      className="stroke-brand"
                      strokeDasharray={`${menageLength} ${DONUT_CIRCUMFERENCE - menageLength}`}
                    />
                    <circle
                      cx="70"
                      cy="70"
                      r={DONUT_RADIUS}
                      className="stroke-brand-series-2"
                      strokeDasharray={`${maintenanceLength} ${DONUT_CIRCUMFERENCE - maintenanceLength}`}
                      strokeDashoffset={-menageLength}
                    />
                  </>
                )}
              </g>
              <text x="70" y="66" textAnchor="middle" className="fill-ink font-mono text-[15px] font-bold">
                {chargesTotal.toFixed(2)}
              </text>
              <text x="70" y="83" textAnchor="middle" className="fill-ink-disabled font-sans text-[11px]">
                MAD ce mois
              </text>
            </svg>
            <div className="flex flex-1 flex-col gap-3">
              <div>
                <div className="flex items-center gap-[7px] text-[13px] font-semibold text-ink">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-sm bg-brand" aria-hidden="true" />
                  Ménage
                </div>
                <div className="pl-4 font-mono text-[13px] text-ink-tertiary">
                  {formatMad(data.frais_menage_totaux)} · {menagePct}%
                </div>
              </div>
              <div>
                <div className="flex items-center gap-[7px] text-[13px] font-semibold text-ink">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-sm bg-brand-series-2" aria-hidden="true" />
                  Maintenance
                </div>
                <div className="pl-4 font-mono text-[13px] text-ink-tertiary">
                  {formatMad(data.frais_maintenance_totaux)} · {maintenancePct}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card-manager border border-border-default bg-surface p-6">
          <h3 className="text-sm font-bold text-ink">Séjours récents</h3>
          {data.sejours_recents.length === 0 ? (
            <p className="mt-2 text-sm text-ink-tertiary">Aucun séjour pour le moment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border-light">
              {data.sejours_recents.map((sejour) => (
                <li key={sejour.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateToSejour?.(sejour.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-[8px] px-1 py-2 text-left transition-colors hover:bg-table-header-bg"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{sejour.nom_voyageur}</p>
                      <p className="truncate text-xs text-ink-tertiary">
                        {sejour.appartement?.nom ?? 'Appartement supprimé'} · {formatDate(sejour.date_arrivee)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-medium ${STATUT_BADGE_STYLES[sejour.statut]}`}
                    >
                      {STATUT_LABELS[sejour.statut]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onNavigateToSejoursListe?.()}
            className="mt-3 text-sm font-semibold text-brand-light hover:text-brand"
          >
            Voir tous les séjours →
          </button>
        </div>

        <div className="rounded-card-manager border border-border-default bg-surface p-6">
          <h3 className="text-sm font-bold text-ink">Appartements</h3>
          {data.appartements.length === 0 ? (
            <p className="mt-2 text-sm text-ink-tertiary">Aucun appartement pour le moment.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-border-default text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-[0.08em] text-ink-tertiary-2">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Séjours</th>
                    <th className="py-2 pr-4">Dernier séjour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {data.appartements.map((appartement) => (
                    <tr
                      key={appartement.id}
                      onClick={() => onNavigateToAppartements?.()}
                      className={
                        onNavigateToAppartements ? 'cursor-pointer transition-colors hover:bg-table-header-bg' : undefined
                      }
                    >
                      <td className="py-2 pr-4 text-ink">{appartement.nom}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-badge px-2 py-0.5 text-xs font-medium ${
                            APPARTEMENT_STATUT_STYLES[appartement.statut] ?? 'bg-table-header-bg text-ink-tertiary'
                          }`}
                        >
                          {APPARTEMENT_STATUT_LABELS[appartement.statut] ?? appartement.statut}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-ink-secondary">{appartement.sejours_count}</td>
                      <td className="py-2 pr-4 text-ink-secondary">{formatDate(appartement.dernier_sejour)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <RelevesProprietairesSection />
    </div>
  )
}
