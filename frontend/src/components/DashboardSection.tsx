import { useState } from 'react'
import type { DashboardData, SejourStatut } from '../types'
import { RelevesProprietairesSection } from './RelevesProprietairesSection'

interface DashboardSectionProps {
  data: DashboardData | null
  loading: boolean
  error: string | null
  onNavigateToAppartements?: () => void
  onNavigateToSejour?: (sejourId: number) => void
  onNavigateToSejoursListe?: (statut?: SejourStatut) => void
  onCheckout?: (sejourId: number) => Promise<void>
  onNavigateToResolutionsAValider?: () => void
}

// Canonical séjour statut labels/colors, kept identical to SejourCard.tsx
// and SejoursListeSection.tsx so badges read the same everywhere.
const STATUT_LABELS: Record<SejourStatut, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
}

const STATUT_BADGE_STYLES: Record<SejourStatut, string> = {
  a_venir: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  termine: 'bg-green-100 text-green-800',
}

const STATUT_CARD_STYLES: Record<SejourStatut, string> = {
  a_venir: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
  en_cours: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  termine: 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100',
}

// Appartement statut labels/colors, kept identical to AppartementsListeSection.tsx.
const APPARTEMENT_STATUT_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  occupe: 'Occupé',
  en_menage: 'En ménage',
  maintenance: 'Maintenance',
}

const APPARTEMENT_STATUT_STYLES: Record<string, string> = {
  disponible: 'bg-green-100 text-green-800',
  occupe: 'bg-gray-100 text-gray-600',
  en_menage: 'bg-purple-100 text-purple-800',
  maintenance: 'bg-red-100 text-red-800',
}

const STATUT_ORDER: SejourStatut[] = ['a_venir', 'en_cours', 'termine']

function formatMad(value: number): string {
  return `${value.toFixed(2)} MAD`
}

function formatDate(value: string | null): string {
  if (!value) return 'Aucun'
  return new Date(value).toLocaleDateString('fr-FR')
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7v10m2.5-7.5c-.5-.6-1.5-1-2.5-1s-2 .5-2 1.5.9 1.3 2 1.5c1.4.3 2.5.6 2.5 1.7s-1 1.8-2.5 1.8-2-.4-2.5-1"
      />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.8 15.9L9 18.75l-.8-2.85a4.5 4.5 0 00-3.1-3.1L2.25 12l2.85-.8a4.5 4.5 0 003.1-3.1L9 5.25l.8 2.85a4.5 4.5 0 003.1 3.1l2.85.8-2.85.8a4.5 4.5 0 00-3.1 3.1z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 3.75v3M16.5 5.25h3" />
    </svg>
  )
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.7 6.3a4 4 0 00-5.09 4.99L4 17v3h3l5.71-5.61a4 4 0 004.99-5.09l-2.62 2.62-2-2z"
      />
    </svg>
  )
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 6h14M7 6l-4 7a4 4 0 008 0l-4-7zM17 6l-4 7a4 4 0 008 0l-4-7z" />
    </svg>
  )
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
    <div className="overflow-hidden rounded-lg border border-orange-300 bg-orange-50 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-200 text-orange-700">
            <SuitcaseIcon className="h-5 w-5" />
          </span>
          <span className="font-semibold text-orange-900">
            {departs.length} départ{departs.length > 1 ? 's' : ''} prévu{departs.length > 1 ? 's' : ''} aujourd'hui
          </span>
        </span>
        <span className="text-orange-700">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ul className="divide-y divide-orange-200 border-t border-orange-200 bg-white">
          {departs.map((depart) => (
            <li key={depart.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400">{depart.reference}</p>
                <p className="font-medium text-gray-900">{depart.voyageur_principal}</p>
                <p className="text-sm text-gray-500">
                  {depart.appartement?.nom ?? 'Appartement supprimé'}
                  {depart.telephone_voyageur ? ` · ${depart.telephone_voyageur}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCheckout(depart.id)}
                disabled={checkingOutId === depart.id}
                className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {checkingOutId === depart.id ? 'Confirmation...' : 'Confirmer le checkout'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {checkoutError && <p className="border-t border-orange-200 bg-white px-4 py-2 text-sm text-red-600">{checkoutError}</p>}
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
  onNavigateToResolutionsAValider,
}: DashboardSectionProps) {
  if (loading) {
    return <p className="text-sm text-gray-500">Chargement du dashboard...</p>
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <DepartsAujourdhuiBanner departs={data.departs_aujourdhui} onCheckout={onCheckout} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CurrencyIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Revenus totaux</p>
              <p className="mt-0.5 text-xl font-semibold text-gray-900" data-testid="dashboard-revenus-totaux">
                {formatMad(data.revenus_totaux)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Frais de ménage totaux</p>
              <p className="mt-0.5 text-xl font-semibold text-gray-900" data-testid="dashboard-frais-menage-totaux">
                {formatMad(data.frais_menage_totaux)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-red-200 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <WrenchIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Frais de maintenance totaux</p>
              <p
                className="mt-0.5 text-xl font-semibold text-gray-900"
                data-testid="dashboard-frais-maintenance-totaux"
              >
                {formatMad(data.frais_maintenance_totaux)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <ScaleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Résultat net</p>
              <p
                className={`mt-0.5 text-xl font-semibold ${data.resultat_net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                data-testid="dashboard-resultat-net"
              >
                {formatMad(data.resultat_net)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">Hors commission propriétaire (non incluse pour le moment)</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700">Séjours par statut</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATUT_ORDER.map((statut) => (
            <button
              key={statut}
              type="button"
              onClick={() => onNavigateToSejoursListe?.(statut)}
              className={`rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${STATUT_CARD_STYLES[statut]}`}
            >
              <p className="text-2xl font-bold">{data.sejours_par_statut[statut]}</p>
              <p className="text-sm font-medium">{STATUT_LABELS[statut]}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Séjours récents</h3>
          {data.sejours_recents.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucun séjour pour le moment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {data.sejours_recents.map((sejour) => (
                <li key={sejour.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateToSejour?.(sejour.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{sejour.nom_voyageur}</p>
                      <p className="truncate text-xs text-gray-500">
                        {sejour.appartement?.nom ?? 'Appartement supprimé'} · {formatDate(sejour.date_arrivee)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_BADGE_STYLES[sejour.statut]}`}
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
            className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Voir tous les séjours →
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Appartements</h3>
          {data.appartements.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucun appartement pour le moment.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-gray-500">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Séjours</th>
                    <th className="py-2 pr-4">Dernier séjour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.appartements.map((appartement) => (
                    <tr
                      key={appartement.id}
                      onClick={() => onNavigateToAppartements?.()}
                      className={
                        onNavigateToAppartements
                          ? 'cursor-pointer transition-colors hover:bg-gray-50'
                          : undefined
                      }
                    >
                      <td className="py-2 pr-4 text-gray-900">{appartement.nom}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            APPARTEMENT_STATUT_STYLES[appartement.statut] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {APPARTEMENT_STATUT_LABELS[appartement.statut] ?? appartement.statut}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{appartement.sejours_count}</td>
                      <td className="py-2 pr-4 text-gray-700">{formatDate(appartement.dernier_sejour)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Ménages à valider</h3>
          {data.menages_a_valider.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucun ménage en attente.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {data.menages_a_valider.map((menage) => (
                <li key={menage.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateToSejour?.(menage.sejour_id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {menage.appartement?.adresse ?? 'Appartement supprimé'}
                      </p>
                      <p className="truncate text-xs text-gray-500">{menage.nom_voyageur}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Résolutions à valider</h3>
          {data.resolutions_a_valider.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucune résolution en attente.</p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {data.resolutions_a_valider.map((resolution) => (
                <li key={resolution.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateToResolutionsAValider?.()}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {resolution.appartement?.adresse ?? 'Appartement supprimé'}
                      </p>
                      {resolution.cout_reparation != null && (
                        <p className="truncate text-xs text-gray-500">{resolution.cout_reparation} MAD</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <RelevesProprietairesSection />
    </div>
  )
}
