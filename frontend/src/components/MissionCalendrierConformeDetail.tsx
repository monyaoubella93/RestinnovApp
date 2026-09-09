import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchMissionMenage, resolveStorageUrl } from '../api'
import type { MissionMenage } from '../types'

interface MissionCalendrierConformeDetailProps {
  missionId: number
  onBack: () => void
}

/**
 * Read-only detail for a mission clicked from the Calendrier that is already
 * "conforme" (validated). Deliberately NOT MissionDetailAgent: that
 * component's terminer() button re-submits the mission for validation
 * whenever the checklist is complete and a photo après exists -- which is
 * always true for an already-validated mission, so reusing it here would let
 * an agent accidentally reopen a finished mission. This shows the same
 * checklist/produits/photo information with no mutating action available.
 */
export function MissionCalendrierConformeDetail({ missionId, onBack }: MissionCalendrierConformeDetailProps) {
  const { t } = useTranslation()
  const [mission, setMission] = useState<MissionMenage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMissionMenage(missionId)
      .then((data) => {
        if (!cancelled) setMission(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('menage.detail.error'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [missionId, t])

  const checklistItems = mission?.checklist_items ?? []
  const produits = mission?.produits ?? []
  const photoApres = (mission?.photos_preuve ?? []).find((photo) => photo.type === 'apres')

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-brand-light hover:text-brand">
        {t('menage.detail.back')}
      </button>

      {loading && <p className="mt-4 text-sm text-ink-tertiary">{t('common.loading')}</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {mission && (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-ink">
              {mission.sejour?.appartement?.nom ?? t('common.apartmentFallback')}
            </h3>
            <p className="text-sm text-ink-tertiary">{mission.sejour?.appartement?.adresse}</p>
          </div>

          <p className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success-bg px-4 py-4 text-center text-base font-semibold text-success-text">
            <span aria-hidden="true" className="text-xl">
              ✅
            </span>
            {t('menage.calendrier.missionValidee')}
          </p>

          <div>
            <h4 className="text-base font-bold text-ink">{t('menage.detail.checklistTitle')}</h4>
            {checklistItems.length === 0 ? (
              <p className="mt-2 text-sm text-ink-tertiary">{t('menage.detail.emptyChecklist')}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {checklistItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-card-agent-lg border-2 border-border-default bg-surface p-3"
                  >
                    <span
                      aria-label={item.coche ? t('common.checked') : t('common.unchecked')}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${
                        item.coche ? 'bg-success text-white' : 'border-2 border-border-default text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="text-sm text-ink-secondary">{item.libelle}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-base font-bold text-ink">{t('menage.historique.produitsUtilises')}</h4>
            {produits.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">{t('menage.historique.aucunProduit')}</p>
            ) : (
              <ul className="mt-1 text-sm text-ink-secondary">
                {produits.map((produit) => (
                  <li key={produit.id}>{produit.nom}</li>
                ))}
              </ul>
            )}
          </div>

          {photoApres && (
            <div>
              <h4 className="text-base font-bold text-ink">{t('menage.detail.photoApresTitle')}</h4>
              <img
                src={resolveStorageUrl(photoApres.photo_url)}
                alt={t('menage.detail.photoApresTitle')}
                className="mt-2 h-32 w-32 rounded-lg object-cover"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
