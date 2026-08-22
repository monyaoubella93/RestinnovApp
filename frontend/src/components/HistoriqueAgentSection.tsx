import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchHistoriqueAgent, resolveStorageUrl } from '../api'
import type { HistoriqueMissionAgent } from '../types'

function formatDate(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(locale)
}

function HistoriqueRow({ mission }: { mission: HistoriqueMissionAgent }) {
  const { t, i18n } = useTranslation()
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
            {mission.appartement?.nom ?? t('common.apartmentFallback')}
          </p>
          <p className="truncate text-sm text-ink-tertiary">{mission.appartement?.adresse}</p>
          <p className="font-mono text-xs text-ink-tertiary">
            {formatDate(mission.sejour.date_depart, i18n.language === 'ar' ? 'ar-MA' : 'fr-FR')}
          </p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-xl text-ink-disabled">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border-light px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
              {mission.checklist_modeles_utilises.length > 0
                ? t('menage.historique.checklistWithModeles', {
                    modeles: mission.checklist_modeles_utilises.join(', '),
                  })
                : t('menage.historique.checklist')}
            </p>
            {mission.checklist_items.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">{t('menage.historique.emptyChecklist')}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {mission.checklist_items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <span
                      aria-label={item.coche ? t('common.checked') : t('common.unchecked')}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        item.coche ? 'bg-success text-white' : 'border border-border-default text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={item.coche ? 'text-ink-secondary' : 'text-ink-tertiary'}>{item.libelle}</span>
                    {item.photo_url && (
                      <img
                        src={resolveStorageUrl(item.photo_url)}
                        alt={t('menage.detail.photoFor', { libelle: item.libelle })}
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
              {t('menage.historique.produitsUtilises')}
            </p>
            {mission.produits.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">{t('menage.historique.aucunProduit')}</p>
            ) : (
              <ul className="mt-1 text-sm text-ink-secondary">
                {mission.produits.map((produit, index) => (
                  <li key={index}>{produit.nom}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export function HistoriqueAgentSection() {
  const { t } = useTranslation()
  const [missions, setMissions] = useState<HistoriqueMissionAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchHistoriqueAgent()
      .then(setMissions)
      .catch((err) => setError(err instanceof Error ? err.message : t('menage.historique.error')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h3 className="text-lg font-bold text-ink">{t('menage.historique.title')}</h3>

      {loading && <p className="mt-4 text-sm text-ink-tertiary">{t('common.loading')}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {!loading && !error && missions.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-table-header-bg text-5xl"
          >
            🗂️
          </div>
          <p className="text-base text-ink-tertiary">{t('menage.historique.empty')}</p>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {missions.map((mission) => (
          <HistoriqueRow key={mission.id} mission={mission} />
        ))}
      </ul>
    </div>
  )
}
