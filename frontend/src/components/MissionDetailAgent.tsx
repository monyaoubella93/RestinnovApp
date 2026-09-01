import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ajouterPhotosPreuveMission,
  detacherProduitUtilise,
  isOfflineQueuedError,
  marquerMissionMenageRefusVu,
  ouvrirMissionMenage,
  resolveStorageUrl,
  signalerProbleme,
  signalerProduit,
  terminerMissionMenage,
  toggleChecklistItem,
  updateMissionMenageProduits,
  updateProduitUtilise,
  type AjouterPhotosPreuveInput,
  type SignalerProblemeInput,
  type SignalerProduitInput,
  type UpdateMissionMenageProduitsInput,
  type UpdateProduitUtiliseInput,
} from '../api'
import type { ChecklistItem, MissionMenage, ProduitCatalogue } from '../types'
import { checklistIcon } from '../utils/checklistIcons'
import { resolveLocalizedLabel } from '../utils/localization'
import { playConfirmSound } from '../utils/sound'
import { FraisMenageSection } from './FraisMenageSection'
import { PhotoPreuveSection } from './PhotoPreuveSection'
import { SignalerProblemeSection } from './SignalerProblemeSection'

interface MissionDetailAgentProps {
  missionId: number
  catalogue: ProduitCatalogue[]
  onBack: () => void
  onMissionTerminee: () => void
}

interface ChecklistGroup {
  nom: string | null
  items: ChecklistItem[]
}

/**
 * Groups consecutive items by their origin checklist_modele_nom, preserving
 * the backend's order (each modele's items are contiguous, in assignment
 * order -- see SejourCheckoutService::genererChecklist). Items with no
 * modele name (nothing assigned, or generated before this field existed)
 * fall into a single unnamed group with no subtitle.
 */
function groupChecklistItems(items: ChecklistItem[]): ChecklistGroup[] {
  const groups: ChecklistGroup[] = []

  for (const item of items) {
    const nom = item.checklist_modele_nom ?? null
    const currentGroup = groups[groups.length - 1]
    if (currentGroup && currentGroup.nom === nom) {
      currentGroup.items.push(item)
    } else {
      groups.push({ nom, items: [item] })
    }
  }

  return groups
}

function ChecklistItemRow({
  item,
  onToggle,
  onPhoto,
}: {
  item: ChecklistItem
  onToggle: (item: ChecklistItem) => void
  onPhoto: (item: ChecklistItem, file: File) => void
}) {
  const { t, i18n } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const libelle = resolveLocalizedLabel(item.libelle, item.libelle_ar, i18n.language)

  return (
    <li className="flex items-center gap-3 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.coche}
        aria-label={libelle}
        onClick={() => onToggle(item)}
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-4 text-2xl font-bold ${
          item.coche
            ? 'border-success bg-success text-white'
            : 'border-border-default bg-surface text-transparent hover:border-brand-light'
        }`}
      >
        ✓
      </button>

      <span aria-hidden="true" className="shrink-0 text-3xl">
        {checklistIcon(item.libelle)}
      </span>

      <span className={`flex-1 text-base ${item.coche ? 'text-ink-disabled line-through' : 'text-ink'}`}>
        {libelle}
      </span>

      {item.photo_reference_url && (
        <img
          src={resolveStorageUrl(item.photo_reference_url)}
          alt={t('menage.detail.photoReferenceFor', { libelle })}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      )}

      <button
        type="button"
        aria-label={t('menage.detail.addPhotoFor', { libelle })}
        onClick={() => fileInputRef.current?.click()}
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 text-2xl ${
          item.photo_url
            ? 'border-success-border bg-success-bg text-success-text'
            : 'border-border-default text-ink-tertiary hover:bg-table-header-bg'
        }`}
      >
        📷
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        aria-label={t('menage.detail.photoFor', { libelle })}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPhoto(item, file)
        }}
      />
    </li>
  )
}

export function MissionDetailAgent({ missionId, catalogue, onBack, onMissionTerminee }: MissionDetailAgentProps) {
  const { t } = useTranslation()
  const [mission, setMission] = useState<MissionMenage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [terminating, setTerminating] = useState(false)
  const [terminerError, setTerminerError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ouvrirMissionMenage(missionId)
      .then((data) => {
        if (!cancelled) setMission(data)
        if (data.statut === 'non_conforme' && data.refus?.some((r) => !r.vu)) {
          void marquerMissionMenageRefusVu(missionId)
        }
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
  }, [missionId])

  const checklistItems = mission?.checklist_items ?? []
  const toutesCochees = checklistItems.every((item) => item.coche)
  const totalItems = checklistItems.length
  const doneItems = checklistItems.filter((item) => item.coche).length
  const progressPct = totalItems === 0 ? 100 : Math.round((doneItems / totalItems) * 100)

  const applyChecklistPatch = (itemId: number, patch: Partial<ChecklistItem>) => {
    setMission((current) =>
      current
        ? {
            ...current,
            checklist_items: (current.checklist_items ?? []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
          }
        : current,
    )
  }

  const handleToggle = async (item: ChecklistItem) => {
    if (!item.coche) playConfirmSound()
    try {
      const updated = await toggleChecklistItem(item.id, { coche: !item.coche })
      applyChecklistPatch(item.id, updated)
    } catch (err) {
      // Offline: the toggle is queued for replay, but the agent still needs
      // to see it take effect immediately -- apply the same patch locally.
      if (!isOfflineQueuedError(err)) throw err
      applyChecklistPatch(item.id, { coche: !item.coche })
    }
  }

  const handlePhoto = async (item: ChecklistItem, file: File) => {
    try {
      const updated = await toggleChecklistItem(item.id, { photo: file })
      applyChecklistPatch(item.id, updated)
    } catch (err) {
      if (!isOfflineQueuedError(err)) throw err
      applyChecklistPatch(item.id, { photo_url: URL.createObjectURL(file) })
    }
  }

  const handleUpdateMissionProduits = async (missionMenageId: number, input: UpdateMissionMenageProduitsInput) => {
    const updated = await updateMissionMenageProduits(missionMenageId, input)
    setMission((current) => (current ? { ...current, ...updated } : current))
  }

  const handleUpdateProduitUtilise = async (missionMenageId: number, produitId: number, input: UpdateProduitUtiliseInput) => {
    const updated = await updateProduitUtilise(missionMenageId, produitId, input)
    setMission((current) => (current ? { ...current, ...updated } : current))
  }

  const handleDetacherProduit = async (missionMenageId: number, produitId: number) => {
    const updated = await detacherProduitUtilise(missionMenageId, produitId)
    setMission((current) => (current ? { ...current, ...updated } : current))
  }

  const handleSignalerProduit = async (missionMenageId: number, input: SignalerProduitInput) => {
    await signalerProduit(missionMenageId, input)
  }

  const handleSignalerProbleme = async (missionMenageId: number, input: SignalerProblemeInput) => {
    await signalerProbleme(missionMenageId, input)
  }

  const handleAjouterPhotosPreuve = async (missionMenageId: number, input: AjouterPhotosPreuveInput) => {
    const created = await ajouterPhotosPreuveMission(missionMenageId, input)
    setMission((current) =>
      current ? { ...current, photos_preuve: [...created, ...(current.photos_preuve ?? [])] } : current,
    )
  }

  const handleTerminer = async () => {
    setTerminerError(null)
    setTerminating(true)
    try {
      const updated = await terminerMissionMenage(missionId)
      setMission(updated)
      onMissionTerminee()
    } catch (err) {
      setTerminerError(err instanceof Error ? err.message : t('common.genericError'))
    } finally {
      setTerminating(false)
    }
  }

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

          {mission.statut === 'non_conforme' && mission.refus && mission.refus.length > 0 && (
            <div data-testid="refus-banner" className="space-y-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">
              <p className="flex items-center gap-2">
                <span aria-hidden="true">⚠️</span>
                {t('menage.detail.refusBanner')}
              </p>
              {mission.refus[0].motif && <p className="font-normal">{mission.refus[0].motif}</p>}
              {mission.refus[0].motif_audio_url && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio controls src={resolveStorageUrl(mission.refus[0].motif_audio_url)} className="w-full" />
              )}
              {mission.refus[0].motif_photo_url && (
                <img
                  src={resolveStorageUrl(mission.refus[0].motif_photo_url)}
                  alt={t('menage.detail.photoMotifRefus')}
                  className="h-32 w-32 rounded-lg object-cover"
                />
              )}
            </div>
          )}

          <PhotoPreuveSection
            missionMenageId={mission.id}
            onAjouter={handleAjouterPhotosPreuve}
            misEnAvant={mission.statut === 'non_conforme'}
          />

          {totalItems > 0 && (
            <div>
              <div
                role="progressbar"
                aria-label={t('menage.detail.progressLabel')}
                aria-valuenow={doneItems}
                aria-valuemin={0}
                aria-valuemax={totalItems}
                className="flex h-4 w-full overflow-hidden rounded-full bg-table-header-bg"
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1 text-end font-mono text-xs text-ink-tertiary">
                {doneItems}/{totalItems}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-base font-bold text-ink">{t('menage.detail.checklistTitle')}</h4>
            {checklistItems.length === 0 ? (
              <p className="mt-2 text-sm text-ink-tertiary">{t('menage.detail.emptyChecklist')}</p>
            ) : (
              <div className="mt-2 space-y-4">
                {groupChecklistItems(checklistItems).map((group, index) => (
                  <div key={group.nom ?? `groupe-${index}`}>
                    {group.nom && (
                      <p className="mb-2 text-sm font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">{group.nom}</p>
                    )}
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <ChecklistItemRow key={item.id} item={item} onToggle={handleToggle} onPhoto={handlePhoto} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FraisMenageSection
            missionMenage={mission}
            catalogue={catalogue}
            onUpdateProduits={handleUpdateMissionProduits}
            onUpdateProduitUtilise={handleUpdateProduitUtilise}
            onDetacherProduit={handleDetacherProduit}
            onSignalerProduit={handleSignalerProduit}
          />

          <SignalerProblemeSection missionMenageId={mission.id} onSignaler={handleSignalerProbleme} />

          {terminerError && <p className="text-sm text-danger">{terminerError}</p>}

          {mission.statut === 'en_attente_validation' ? (
            <p className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success-bg px-4 py-4 text-center text-base font-semibold text-success-text">
              <span aria-hidden="true" className="text-xl">
                ✅
              </span>
              {t('menage.detail.sentForValidation')}
            </p>
          ) : (
            <button
              type="button"
              disabled={!toutesCochees || terminating}
              onClick={handleTerminer}
              title={!toutesCochees ? t('menage.detail.checkAllToFinish') : undefined}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-4 text-lg font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-ink-disabled"
            >
              <span aria-hidden="true" className="text-xl">
                ✓
              </span>
              {terminating ? t('menage.detail.finishing') : t('menage.detail.finish')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
