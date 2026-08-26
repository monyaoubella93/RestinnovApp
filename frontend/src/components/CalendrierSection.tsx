import { useEffect, useState } from 'react'
import { fetchCalendrier } from '../api'
import type { Appartement, CalendrierData, CalendrierJour, CalendrierSejour, SejourStatut } from '../types'

interface CalendrierSectionProps {
  appartements: Appartement[]
  onNavigateToSejour: (sejourId: number) => void
}

const STATUT_LABELS: Record<SejourStatut, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
  annule: 'Annulé',
}

const STATUT_CELL_STYLES: Record<SejourStatut, string> = {
  a_venir: 'bg-brand-pale text-brand',
  en_cours: 'bg-warning-bg text-warning-text',
  termine: 'bg-success-bg text-success-text',
  annule: 'bg-danger-bg text-danger',
}

const STATUT_DOT_STYLES: Record<SejourStatut, string> = {
  a_venir: 'bg-brand',
  en_cours: 'bg-warning',
  termine: 'bg-success',
  annule: 'bg-danger',
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

// en_cours (happening today) is the most actionable status to surface first,
// then a_venir, then termine -- used to pick one color for a day that has
// several séjours (e.g. several appartements occupied the same day).
const STATUT_PRIORITY: SejourStatut[] = ['en_cours', 'a_venir', 'termine']

function dominantStatut(sejours: CalendrierSejour[]): SejourStatut | null {
  for (const statut of STATUT_PRIORITY) {
    if (sejours.some((sejour) => sejour.statut === statut)) return statut
  }
  return null
}

function moisLabel(mois: string): string {
  const label = new Date(`${mois}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function addMonths(mois: string, delta: number): string {
  const [year, month] = mois.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function currentMois(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function CalendrierSection({ appartements, onNavigateToSejour }: CalendrierSectionProps) {
  const [mois, setMois] = useState(currentMois())
  const [appartementFilter, setAppartementFilter] = useState('')
  const [data, setData] = useState<CalendrierData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<CalendrierJour | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCalendrier({ mois, appartementId: appartementFilter ? Number(appartementFilter) : undefined })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger le calendrier.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mois, appartementFilter])

  const jours = data?.jours ?? []
  const premierJour = jours[0] ? new Date(`${jours[0].date}T00:00:00`) : null
  // French week starts on Monday -- JS getDay() is 0 (Sun) .. 6 (Sat).
  const leadingBlanks = premierJour ? (premierJour.getDay() + 6) % 7 : 0
  const cells: (CalendrierJour | null)[] = [...Array(leadingBlanks).fill(null), ...jours]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-[-0.02em] text-ink">Calendrier</h3>
          <p className="text-[13px] text-ink-tertiary">Occupation des appartements par jour</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card-manager border border-border-default bg-surface p-4">
        <div>
          <label htmlFor="calendrier_appartement" className="block text-xs font-semibold text-ink-secondary">
            Appartement
          </label>
          <select
            id="calendrier_appartement"
            value={appartementFilter}
            onChange={(e) => setAppartementFilter(e.target.value)}
            className="mt-1 block w-full min-w-[220px] rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Tous les appartements</option>
            {appartements.map((appartement) => (
              <option key={appartement.id} value={appartement.id}>
                {appartement.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Mois précédent"
            onClick={() => setMois((current) => addMonths(current, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg"
          >
            ←
          </button>
          <div className="w-40 text-center text-sm font-bold text-ink">{moisLabel(mois)}</div>
          <button
            type="button"
            aria-label="Mois suivant"
            onClick={() => setMois((current) => addMonths(current, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg"
          >
            →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-secondary">
        {(['a_venir', 'en_cours', 'termine'] as SejourStatut[]).map((statut) => (
          <div key={statut} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUT_DOT_STYLES[statut]}`} aria-hidden="true" />
            {STATUT_LABELS[statut]}
          </div>
        ))}
      </div>

      {loading && <p className="text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-card-manager border border-border-default bg-surface">
          <div className="grid grid-cols-7 border-b border-border-default bg-table-header-bg text-[11px] font-bold uppercase tracking-[0.08em] text-ink-tertiary-2">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-2 text-center">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((jour, index) => {
              if (!jour) {
                return <div key={`blank-${index}`} className="min-h-[72px] border-b border-r border-border-light" />
              }

              const statut = dominantStatut(jour.sejours)
              const jourNumero = Number(jour.date.slice(-2))
              const occupied = jour.sejours.length > 0

              return (
                <button
                  key={jour.date}
                  type="button"
                  disabled={!occupied}
                  onClick={() => setSelectedDay(jour)}
                  aria-label={
                    occupied
                      ? `${jour.date} : ${jour.sejours.length} séjour${jour.sejours.length > 1 ? 's' : ''}`
                      : jour.date
                  }
                  className={`relative flex min-h-[72px] flex-col items-start gap-1 border-b border-r border-border-light p-2 text-left text-sm ${
                    occupied
                      ? `${statut ? STATUT_CELL_STYLES[statut] : ''} font-semibold hover:brightness-95`
                      : 'text-ink-secondary'
                  }`}
                >
                  <span>{jourNumero}</span>
                  {jour.sejours.length > 1 && (
                    <span
                      data-testid={`jour-badge-${jour.date}`}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white"
                    >
                      {jour.sejours.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card-manager bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {new Date(`${selectedDay.date}T00:00:00`).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSelectedDay(null)}
                className="text-ink-tertiary hover:text-ink"
              >
                ✕
              </button>
            </div>

            <ul className="mt-3 divide-y divide-border-light">
              {selectedDay.sejours.map((sejour) => (
                <li key={sejour.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDay(null)
                      onNavigateToSejour(sejour.id)
                    }}
                    className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-table-header-bg"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink">{sejour.nom_voyageur}</div>
                      <div className="text-[13px] text-ink-tertiary">
                        {sejour.reference}
                        {sejour.appartement ? ` — ${sejour.appartement.nom}` : ''}
                      </div>
                    </div>
                    <span className={`rounded-badge px-2 py-0.5 text-xs font-bold ${STATUT_CELL_STYLES[sejour.statut]}`}>
                      {STATUT_LABELS[sejour.statut]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
