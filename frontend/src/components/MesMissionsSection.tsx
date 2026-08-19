import { useState } from 'react'
import { resolveStorageUrl } from '../api'
import { InstallPromptCard } from '../pwa/InstallPromptCard'
import type { MissionMenage, ProduitCatalogue } from '../types'
import { STATUT_VALIDATION_LABELS, STATUT_VALIDATION_STYLES } from '../utils/statutValidation'
import { MissionDetailAgent } from './MissionDetailAgent'

interface MesMissionsSectionProps {
  missions: MissionMenage[]
  catalogue: ProduitCatalogue[]
  loading: boolean
  error: string | null
  heading?: string
  subheading?: string
  emptyMessage: string
  emptyIcon: string
  onRefresh: () => void
}

// Only the two statuts that need a clear, distinct callout in this list --
// a_faire/en_cours are the agent's normal current work and need no badge.
const STATUT_BADGES: Partial<Record<MissionMenage['statut'], { label: string; style: string }>> = {
  en_attente_validation: {
    label: STATUT_VALIDATION_LABELS.en_attente,
    style: STATUT_VALIDATION_STYLES.en_attente,
  },
  non_conforme: {
    label: STATUT_VALIDATION_LABELS.refuse,
    style: STATUT_VALIDATION_STYLES.refuse,
  },
}

export function MesMissionsSection({
  missions,
  catalogue,
  loading,
  error,
  heading,
  subheading,
  emptyMessage,
  emptyIcon,
  onRefresh,
}: MesMissionsSectionProps) {
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null)

  if (selectedMissionId != null) {
    return (
      <MissionDetailAgent
        missionId={selectedMissionId}
        catalogue={catalogue}
        onBack={() => {
          setSelectedMissionId(null)
          onRefresh()
        }}
        onMissionTerminee={() => {
          // Stays on the detail view: MissionDetailAgent now shows a
          // confirmation message instead of silently disappearing --
          // refresh the underlying list in the background so it's already
          // up to date once the agent clicks "Retour à mes missions".
          onRefresh()
        }}
      />
    )
  }

  return (
    <div>
      {(heading || subheading) && (
        <div>
          {heading && <h3 className="text-lg font-bold text-ink">{heading}</h3>}
          {subheading && <p className="text-sm text-ink-tertiary">{subheading}</p>}
        </div>
      )}

      {heading && (
        <div className="mt-4">
          <InstallPromptCard />
        </div>
      )}

      {loading && <p className="mt-4 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {!loading && !error && missions.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-success-bg text-5xl"
          >
            {emptyIcon}
          </div>
          <p className="text-base text-ink-tertiary">{emptyMessage}</p>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {missions.map((mission) => {
          const appartement = mission.sejour?.appartement
          const badge = STATUT_BADGES[mission.statut]
          return (
            <li key={mission.id}>
              <button
                type="button"
                onClick={() => setSelectedMissionId(mission.id)}
                className="flex min-h-[96px] w-full items-center gap-4 rounded-card-agent-lg border-2 border-border-default bg-surface p-4 text-left hover:border-brand-border hover:shadow-md"
              >
                <div className="relative shrink-0">
                  {appartement?.photo_principale ? (
                    <img
                      data-testid={`appartement-photo-${mission.id}`}
                      src={resolveStorageUrl(appartement.photo_principale)}
                      alt=""
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-20 w-20 items-center justify-center rounded-xl bg-brand-pale text-4xl"
                    >
                      🏠
                    </div>
                  )}
                  {!mission.vue && (
                    <span
                      data-testid={`mission-nouvelle-badge-${mission.id}`}
                      role="status"
                      aria-label="Nouvelle mission"
                      className="absolute -right-1 -top-1 h-5 w-5 rounded-full border-2 border-white bg-warning"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-ink">{appartement?.nom ?? `Appartement`}</p>
                  <p className="truncate text-sm text-ink-tertiary">{appartement?.adresse}</p>
                  {badge && (
                    <span className={`mt-1 inline-block rounded-badge px-2 py-0.5 text-xs font-bold ${badge.style}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
