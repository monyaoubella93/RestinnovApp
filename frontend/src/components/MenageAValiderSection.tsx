import { useEffect, useState } from 'react'
import {
  fetchMissionsAValider,
  refuserMissionMenage,
  rejeterProduitSignale,
  validerMissionMenage,
  validerProduitSignale,
  type RefuserInput,
  type ValiderProduitSignaleInput,
} from '../api'
import type { MissionMenage } from '../types'
import { MissionValidationDetail } from './MissionValidationDetail'
import { RefuserModal } from './RefuserModal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface MissionAValiderCardProps {
  mission: MissionMenage
  onValider: (missionMenageId: number) => Promise<void>
  onRefuser: (missionMenageId: number, input: RefuserInput) => Promise<void>
  onValiderProduitSignale: (id: number, input: ValiderProduitSignaleInput) => Promise<void>
  onRejeterProduitSignale: (id: number) => Promise<void>
}

function MissionAValiderCard({
  mission,
  onValider,
  onRefuser,
  onValiderProduitSignale,
  onRejeterProduitSignale,
}: MissionAValiderCardProps) {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRefuserModal, setShowRefuserModal] = useState(false)

  const handleValider = async () => {
    setError(null)
    setValidating(true)
    try {
      await onValider(mission.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setValidating(false)
    }
  }

  return (
    <li className="rounded-card-manager border border-border-default bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{mission.sejour?.appartement?.nom ?? 'Appartement supprimé'}</p>
          <p className="text-sm text-ink-secondary">{mission.sejour?.appartement?.adresse}</p>
          {mission.sejour?.reference && (
            <p className="font-mono text-xs text-ink-tertiary">
              {mission.sejour.reference}
              {mission.sejour.nom_voyageur && ` · ${mission.sejour.nom_voyageur}`}
            </p>
          )}
          {mission.sejour?.date_arrivee && mission.sejour?.date_depart && (
            <p className="font-mono text-xs text-ink-tertiary">
              {formatDate(mission.sejour.date_arrivee)} → {formatDate(mission.sejour.date_depart)}
            </p>
          )}
        </div>
        <p className="shrink-0 text-sm text-ink-tertiary">
          Agent : <span className="font-medium text-ink">{mission.agent?.nom ?? 'non assigné'}</span>
        </p>
      </div>

      <MissionValidationDetail
        mission={mission}
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
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}

      {showRefuserModal && (
        <RefuserModal
          title={`Refuser la mission — ${mission.sejour?.appartement?.nom ?? 'appartement'}`}
          onCancel={() => setShowRefuserModal(false)}
          onConfirm={async ({ motif, motifAudio, motifPhoto }) => {
            await onRefuser(mission.id, { motif, motifAudio, motifPhoto })
            setShowRefuserModal(false)
          }}
        />
      )}
    </li>
  )
}

/**
 * Manager-wide "Ménage à valider" queue -- every mission de ménage waiting
 * on the Manager's decision, across every appartement and agent, so
 * validating doesn't require going through the Séjours screen first. A
 * mission leaves this list as soon as it's validated (then it appears in
 * "Historique") or refused (it goes back to the agent instead).
 */
export function MenageAValiderSection() {
  const [missions, setMissions] = useState<MissionMenage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchMissionsAValider()
      .then(setMissions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les missions.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleValider = async (missionMenageId: number) => {
    await validerMissionMenage(missionMenageId)
    setMissions((current) => current.filter((m) => m.id !== missionMenageId))
  }

  const handleRefuser = async (missionMenageId: number, input: RefuserInput) => {
    await refuserMissionMenage(missionMenageId, input)
    setMissions((current) => current.filter((m) => m.id !== missionMenageId))
  }

  const handleValiderProduitSignale = async (id: number, input: ValiderProduitSignaleInput) => {
    const updated = await validerProduitSignale(id, input)
    setMissions((current) =>
      current.map((m) => ({
        ...m,
        produits_signales: (m.produits_signales ?? []).map((p) => (p.id === id ? updated : p)),
      })),
    )
  }

  const handleRejeterProduitSignale = async (id: number) => {
    const updated = await rejeterProduitSignale(id)
    setMissions((current) =>
      current.map((m) => ({
        ...m,
        produits_signales: (m.produits_signales ?? []).map((p) => (p.id === id ? updated : p)),
      })),
    )
  }

  return (
    <div className="rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        Ménage à valider
        <span className="rounded-badge bg-warning-bg px-2 py-0.5 text-xs font-bold text-warning-text">
          {missions.length}
        </span>
      </h2>

      {loading && <p className="mt-2 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!loading && !error && missions.length === 0 && (
        <p className="mt-2 text-sm text-ink-tertiary">Aucun ménage en attente de validation.</p>
      )}

      {!loading && !error && missions.length > 0 && (
        <ul className="mt-3 space-y-3">
          {missions.map((mission) => (
            <MissionAValiderCard
              key={mission.id}
              mission={mission}
              onValider={handleValider}
              onRefuser={handleRefuser}
              onValiderProduitSignale={handleValiderProduitSignale}
              onRejeterProduitSignale={handleRejeterProduitSignale}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
