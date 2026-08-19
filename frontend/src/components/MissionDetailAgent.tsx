import { useEffect, useRef, useState } from 'react'
import {
  ajouterPhotosPreuveMission,
  marquerMissionMenageRefusVu,
  ouvrirMissionMenage,
  resolveStorageUrl,
  signalerProbleme,
  signalerProduit,
  terminerMissionMenage,
  toggleChecklistItem,
  updateMissionMenageProduits,
  type AjouterPhotosPreuveInput,
  type SignalerProblemeInput,
  type SignalerProduitInput,
  type UpdateMissionMenageProduitsInput,
} from '../api'
import type { ChecklistItem, MissionMenage, ProduitCatalogue } from '../types'
import { checklistIcon } from '../utils/checklistIcons'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <li className="flex items-center gap-3 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.coche}
        aria-label={item.libelle}
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
        {item.libelle}
      </span>

      {item.photo_reference_url && (
        <img
          src={resolveStorageUrl(item.photo_reference_url)}
          alt={`Photo de référence pour "${item.libelle}"`}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      )}

      <button
        type="button"
        aria-label={`Ajouter une photo pour "${item.libelle}"`}
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
        aria-label={`Photo pour "${item.libelle}"`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPhoto(item, file)
        }}
      />
    </li>
  )
}

export function MissionDetailAgent({ missionId, catalogue, onBack, onMissionTerminee }: MissionDetailAgentProps) {
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger la mission.')
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

  const handleToggle = async (item: ChecklistItem) => {
    if (!item.coche) playConfirmSound()
    const updated = await toggleChecklistItem(item.id, { coche: !item.coche })
    setMission((current) =>
      current
        ? { ...current, checklist_items: (current.checklist_items ?? []).map((i) => (i.id === updated.id ? updated : i)) }
        : current,
    )
  }

  const handlePhoto = async (item: ChecklistItem, file: File) => {
    const updated = await toggleChecklistItem(item.id, { photo: file })
    setMission((current) =>
      current
        ? { ...current, checklist_items: (current.checklist_items ?? []).map((i) => (i.id === updated.id ? updated : i)) }
        : current,
    )
  }

  const handleUpdateMissionProduits = async (missionMenageId: number, input: UpdateMissionMenageProduitsInput) => {
    const updated = await updateMissionMenageProduits(missionMenageId, input)
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
      setTerminerError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setTerminating(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-brand-light hover:text-brand">
        ← Retour à mes missions
      </button>

      {loading && <p className="mt-4 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {mission && (
        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-ink">{mission.sejour?.appartement?.nom ?? 'Appartement'}</h3>
            <p className="text-sm text-ink-tertiary">{mission.sejour?.appartement?.adresse}</p>
          </div>

          {mission.statut === 'non_conforme' && mission.refus && mission.refus.length > 0 && (
            <div data-testid="refus-banner" className="space-y-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">
              <p className="flex items-center gap-2">
                <span aria-hidden="true">⚠️</span>
                Renvoyé par le Manager — à refaire avant de marquer terminé à nouveau.
              </p>
              {mission.refus[0].motif && <p className="font-normal">{mission.refus[0].motif}</p>}
              {mission.refus[0].motif_audio_url && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio controls src={resolveStorageUrl(mission.refus[0].motif_audio_url)} className="w-full" />
              )}
              {mission.refus[0].motif_photo_url && (
                <img
                  src={resolveStorageUrl(mission.refus[0].motif_photo_url)}
                  alt="Photo du motif de refus"
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
                aria-label="Progression de la checklist"
                aria-valuenow={doneItems}
                aria-valuemin={0}
                aria-valuemax={totalItems}
                className="h-4 w-full overflow-hidden rounded-full bg-table-header-bg"
              >
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="mt-1 text-right font-mono text-xs text-ink-tertiary">
                {doneItems}/{totalItems}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-base font-bold text-ink">Checklist</h4>
            {checklistItems.length === 0 ? (
              <p className="mt-2 text-sm text-ink-tertiary">Aucun item de checklist pour cet appartement.</p>
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
            onSignalerProduit={handleSignalerProduit}
          />

          <SignalerProblemeSection missionMenageId={mission.id} onSignaler={handleSignalerProbleme} />

          {terminerError && <p className="text-sm text-danger">{terminerError}</p>}

          {mission.statut === 'en_attente_validation' ? (
            <p className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success-bg px-4 py-4 text-center text-base font-semibold text-success-text">
              <span aria-hidden="true" className="text-xl">
                ✅
              </span>
              Envoyé au Manager pour validation
            </p>
          ) : (
            <button
              type="button"
              disabled={!toutesCochees || terminating}
              onClick={handleTerminer}
              title={!toutesCochees ? 'Cochez tous les items de la checklist pour terminer la mission.' : undefined}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-4 text-lg font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:bg-border-default disabled:text-ink-disabled"
            >
              <span aria-hidden="true" className="text-xl">
                ✓
              </span>
              {terminating ? 'Enregistrement...' : 'Marquer terminé'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
