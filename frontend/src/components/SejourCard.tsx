import { useState } from 'react'
import { resolveStorageUrl, type RefuserInput, type UpdateProduitUtiliseInput } from '../api'
import type { MissionMenage, ProduitCatalogue, Sejour } from '../types'
import { FraisMaintenanceSection } from './FraisMaintenanceSection'
import { FraisMenageSection } from './FraisMenageSection'
import { MissionValidationDetail } from './MissionValidationDetail'
import { RefuserModal } from './RefuserModal'

const STATUT_LABELS: Record<Sejour['statut'], string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé',
}

const STATUT_STYLES: Record<Sejour['statut'], string> = {
  a_venir: 'bg-brand-pale text-brand',
  en_cours: 'bg-warning-bg text-warning-text',
  termine: 'bg-table-header-bg text-ink-tertiary',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function RefusHistoriqueMenage({ mission }: { mission: MissionMenage }) {
  if (!mission.refus || mission.refus.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-ink-secondary">Historique des refus</p>
      <ul className="mt-1 space-y-2">
        {mission.refus.map((refus) => (
          <li key={refus.id} className="space-y-1 rounded-field bg-danger-bg p-2 text-sm text-danger">
            <p className="font-mono text-xs text-danger">{formatDate(refus.created_at)}</p>
            {refus.motif && <p>{refus.motif}</p>}
            {refus.motif_audio_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={resolveStorageUrl(refus.motif_audio_url)} className="w-full" />
            )}
            {refus.motif_photo_url && (
              <img
                src={resolveStorageUrl(refus.motif_photo_url)}
                alt="Photo du motif de refus"
                className="h-24 w-24 rounded object-cover"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface SejourCardProps {
  sejour: Sejour
  catalogue: ProduitCatalogue[]
  onCheckout: (id: number) => Promise<void>
  onValiderMission: (missionMenageId: number) => Promise<void>
  onRefuserMission: (missionMenageId: number, input: RefuserInput) => Promise<void>
  onUpdateMissionProduits: (missionMenageId: number, input: { frais_forfait: number }) => Promise<void>
  onUpdateProduitUtilise: (missionMenageId: number, produitId: number, input: UpdateProduitUtiliseInput) => Promise<void>
  onDetacherProduit: (missionMenageId: number, produitId: number) => Promise<void>
  onSignalerProduit: (missionMenageId: number, input: { photo: File; note?: string | null }) => Promise<void>
  onValiderProduitSignale: (id: number, input: { nom: string; prix: number }) => Promise<void>
  onRejeterProduitSignale: (id: number) => Promise<void>
  onAddFraisMaintenance: (sejourId: number, input: { description: string; prix: number }) => Promise<void>
  onDeleteFraisMaintenance: (id: number) => Promise<void>
}

export function SejourCard({
  sejour,
  catalogue,
  onCheckout,
  onValiderMission,
  onRefuserMission,
  onUpdateMissionProduits,
  onUpdateProduitUtilise,
  onDetacherProduit,
  onSignalerProduit,
  onValiderProduitSignale,
  onRejeterProduitSignale,
  onAddFraisMaintenance,
  onDeleteFraisMaintenance,
}: SejourCardProps) {
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [validerError, setValiderError] = useState<string | null>(null)
  const [showRefuserModal, setShowRefuserModal] = useState(false)

  const handleCheckout = async () => {
    setError(null)
    setCheckingOut(true)
    try {
      await onCheckout(sejour.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setCheckingOut(false)
    }
  }

  const handleValider = async () => {
    if (!sejour.mission_menage) return
    setValiderError(null)
    setValidating(true)
    try {
      await onValiderMission(sejour.mission_menage.id)
    } catch (err) {
      setValiderError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setValidating(false)
    }
  }

  return (
    <li className="rounded-card-manager border border-border-default bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-ink-tertiary" data-testid="sejour-reference">
            {sejour.reference}
          </p>
          <p className="font-semibold text-ink">{sejour.nom_voyageur}</p>
          <p className="text-sm text-ink-secondary">{sejour.appartement?.nom ?? `Appartement #${sejour.appartement_id}`}</p>
          <p className="font-mono text-sm text-ink-tertiary">
            {sejour.date_arrivee} → {sejour.date_depart}
          </p>
        </div>
        <span className={`shrink-0 rounded-badge px-3 py-1 text-xs font-bold ${STATUT_STYLES[sejour.statut]}`}>
          {STATUT_LABELS[sejour.statut]}
        </span>
      </div>

      {sejour.mission_menage && (
        <div className="mt-3 rounded-field bg-table-header-bg p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-ink-secondary">
            Mission de ménage créée
            {!sejour.mission_menage.vue && (
              <span
                data-testid="mission-nouvelle-badge"
                className="rounded-badge bg-brand px-2 py-0.5 text-xs font-bold text-white"
              >
                Nouveau
              </span>
            )}
          </p>
          <p className="text-ink-tertiary">
            Agent assigné :{' '}
            <span className="font-medium text-ink">
              {sejour.mission_menage.agent?.nom ?? 'non assigné'}
            </span>
          </p>

          {sejour.mission_menage.statut === 'en_attente_validation' && (
            <div className="mt-2">
              <p className="mb-2 font-semibold text-violet">En attente de validation</p>
              <MissionValidationDetail
                mission={sejour.mission_menage}
                onValiderProduitSignale={onValiderProduitSignale}
                onRejeterProduitSignale={onRejeterProduitSignale}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleValider}
                  disabled={validating}
                  className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {validating ? 'Validation...' : 'Valider'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRefuserModal(true)}
                  disabled={validating}
                  className="rounded-field bg-danger px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                >
                  Refuser
                </button>
              </div>
              {validerError && <p className="mt-1 text-sm text-danger">{validerError}</p>}

              {showRefuserModal && (
                <RefuserModal
                  title={`Refuser la mission — ${sejour.appartement?.nom ?? `Appartement #${sejour.appartement_id}`}`}
                  onCancel={() => setShowRefuserModal(false)}
                  onConfirm={async ({ motif, motifAudio, motifPhoto }) => {
                    await onRefuserMission(sejour.mission_menage!.id, { motif, motifAudio, motifPhoto })
                    setShowRefuserModal(false)
                  }}
                />
              )}
            </div>
          )}

          {sejour.mission_menage.statut === 'non_conforme' && (
            <div className="mt-2 space-y-2" data-testid="mission-non-conforme">
              <p className="font-semibold text-danger">Refusée — en attente de correction par l'agent</p>
              <MissionValidationDetail mission={sejour.mission_menage} />
              <RefusHistoriqueMenage mission={sejour.mission_menage} />
            </div>
          )}
        </div>
      )}

      {sejour.statut !== 'termine' && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={checkingOut}
            className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {checkingOut ? 'Confirmation...' : 'Confirmer le checkout'}
          </button>
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
      )}

      {sejour.statut === 'termine' && sejour.mission_menage && (
        <>
          <FraisMenageSection
            missionMenage={sejour.mission_menage}
            catalogue={catalogue}
            onUpdateProduits={onUpdateMissionProduits}
            onUpdateProduitUtilise={onUpdateProduitUtilise}
            onDetacherProduit={onDetacherProduit}
            onSignalerProduit={onSignalerProduit}
          />
          <FraisMaintenanceSection
            sejourId={sejour.id}
            fraisMaintenance={sejour.frais_maintenance ?? []}
            onAdd={onAddFraisMaintenance}
            onDelete={onDeleteFraisMaintenance}
          />
        </>
      )}
    </li>
  )
}
