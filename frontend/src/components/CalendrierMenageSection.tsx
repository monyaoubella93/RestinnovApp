import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchCalendrierAgent } from '../api'
import type { MissionCalendrierEntry, MissionStatut, ProduitCatalogue } from '../types'
import { STATUT_VALIDATION_STYLES } from '../utils/statutValidation'
import { MissionCalendrierConformeDetail } from './MissionCalendrierConformeDetail'
import { MissionDetailAgent } from './MissionDetailAgent'

interface CalendrierMenageSectionProps {
  catalogue: ProduitCatalogue[]
}

// a_faire/en_cours share the same neutral color -- they're both "not yet
// done" from the agent's point of view, same convention as MesMissionsSection
// showing no distinct badge for either.
const STATUT_CHIP_STYLES: Record<MissionStatut, string> = {
  a_faire: 'bg-table-header-bg text-ink-secondary',
  en_cours: 'bg-table-header-bg text-ink-secondary',
  en_attente_validation: STATUT_VALIDATION_STYLES.en_attente,
  conforme: STATUT_VALIDATION_STYLES.valide,
  non_conforme: STATUT_VALIDATION_STYLES.refuse,
}

const STATUT_DOT_STYLES: Record<MissionStatut, string> = {
  a_faire: 'bg-ink-tertiary',
  en_cours: 'bg-ink-tertiary',
  en_attente_validation: 'bg-violet',
  conforme: 'bg-success',
  non_conforme: 'bg-danger',
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CalendrierMenageSection({ catalogue }: CalendrierMenageSectionProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'ar' ? 'ar-MA' : 'fr-FR'
  const [entries, setEntries] = useState<MissionCalendrierEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mois, setMois] = useState(() => startOfMonth(new Date()))
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null)
  const [selectedConformeId, setSelectedConformeId] = useState<number | null>(null)

  const charger = () => {
    setLoading(true)
    setError(null)
    fetchCalendrierAgent()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : t('menage.calendrier.error')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entriesParJour = useMemo(() => {
    const map = new Map<string, MissionCalendrierEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    return map
  }, [entries])

  if (selectedMissionId != null) {
    return (
      <MissionDetailAgent
        missionId={selectedMissionId}
        catalogue={catalogue}
        onBack={() => {
          setSelectedMissionId(null)
          charger()
        }}
        onMissionTerminee={charger}
      />
    )
  }

  if (selectedConformeId != null) {
    return (
      <MissionCalendrierConformeDetail missionId={selectedConformeId} onBack={() => setSelectedConformeId(null)} />
    )
  }

  const handleEntryClick = (entry: MissionCalendrierEntry) => {
    if (entry.statut === 'conforme') {
      setSelectedConformeId(entry.id)
    } else {
      setSelectedMissionId(entry.id)
    }
  }

  // Monday-first week grid, same mechanics as the Manager's CalendrierSection.
  const leadingBlanks = (mois.getDay() + 6) % 7
  const joursDansLeMois = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()
  const jours = Array.from({ length: joursDansLeMois }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1))
  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...jours]
  while (cells.length % 7 !== 0) cells.push(null)

  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    // 2024-01-01 is a Monday -- used only to derive locale-correct short names.
    const d = new Date(2024, 0, 1 + i)
    return d.toLocaleDateString(locale, { weekday: 'short' })
  })

  const moisLabel = (() => {
    const label = mois.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  })()

  return (
    <div>
      <h3 className="text-lg font-bold text-ink">{t('menage.calendrier.title')}</h3>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={t('menage.calendrier.moisPrecedent')}
          onClick={() => setMois((current) => addMonths(current, -1))}
          className="flex h-10 w-10 items-center justify-center rounded-field border-2 border-border-default text-ink-secondary hover:bg-table-header-bg"
        >
          ←
        </button>
        <div className="text-base font-bold text-ink">{moisLabel}</div>
        <button
          type="button"
          aria-label={t('menage.calendrier.moisSuivant')}
          onClick={() => setMois((current) => addMonths(current, 1))}
          className="flex h-10 w-10 items-center justify-center rounded-field border-2 border-border-default text-ink-secondary hover:bg-table-header-bg"
        >
          →
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
        {(['a_faire', 'en_attente_validation', 'conforme', 'non_conforme'] as MissionStatut[]).map((statut) => (
          <div key={statut} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUT_DOT_STYLES[statut]}`} aria-hidden="true" />
            {statut === 'a_faire' && t('menage.calendrier.legende.aFaire')}
            {statut === 'en_attente_validation' && t('menage.calendrier.legende.enAttente')}
            {statut === 'conforme' && t('menage.calendrier.legende.conforme')}
            {statut === 'non_conforme' && t('menage.calendrier.legende.refusee')}
          </div>
        ))}
      </div>

      {loading && <p className="mt-4 text-sm text-ink-tertiary">{t('common.loading')}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="mt-4 text-sm text-ink-tertiary">{t('menage.calendrier.empty')}</p>
      )}

      {!loading && !error && (
        <div className="mt-4 overflow-hidden rounded-card-agent-lg border-2 border-border-default bg-surface">
          <div className="grid grid-cols-7 border-b border-border-default bg-table-header-bg text-[11px] font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
            {weekdayLabels.map((label, index) => (
              <div key={index} className="px-1 py-2 text-center">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((jour, index) => {
              if (!jour) {
                return <div key={`blank-${index}`} className="min-h-[88px] border-b border-r border-border-light" />
              }

              const key = toDateKey(jour)
              const missionsDuJour = entriesParJour.get(key) ?? []

              return (
                <div
                  key={key}
                  data-testid={`calendrier-jour-${key}`}
                  className="min-h-[88px] border-b border-r border-border-light p-1"
                >
                  <span className="text-xs font-semibold text-ink-tertiary">{jour.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {missionsDuJour.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleEntryClick(entry)}
                        className={`block w-full truncate rounded px-1 py-0.5 text-start text-[11px] font-semibold hover:brightness-95 ${STATUT_CHIP_STYLES[entry.statut]}`}
                      >
                        {entry.appartement?.nom ?? t('common.apartmentFallback')}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
