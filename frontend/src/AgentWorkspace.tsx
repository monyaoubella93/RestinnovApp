import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { fetchMissionsAgent, fetchProduitsCatalogue } from './api'
import { HistoriqueAgentSection } from './components/HistoriqueAgentSection'
import { MesMissionsSection } from './components/MesMissionsSection'
import { usePwaIdentity } from './pwa/usePwaIdentity'
import type { MissionMenage, ProduitCatalogue } from './types'

type Onglet = 'mes-missions' | 'en-attente' | 'refusees' | 'validees'

const ONGLETS: { id: Onglet; label: string; icon: string }[] = [
  { id: 'mes-missions', label: 'Mes missions', icon: '🧹' },
  { id: 'en-attente', label: 'En attente', icon: '⏳' },
  { id: 'refusees', label: 'Refusées', icon: '⚠️' },
  { id: 'validees', label: 'Validées', icon: '🗂️' },
]

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * The cleaning agent's whole world: full screen, no Manager sidebar, no
 * Dashboard/Séjours/Appartements nav -- just their own missions, switched
 * via a simple four-tab bar (mes missions / en attente de validation /
 * refusées / validées). Reuses MesMissionsSection/MissionDetailAgent
 * unchanged from the Manager build.
 */
export function AgentWorkspace() {
  usePwaIdentity('menage')

  const { user, logout } = useAuth()
  const [catalogue, setCatalogue] = useState<ProduitCatalogue[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('mes-missions')
  const [missions, setMissions] = useState<MissionMenage[]>([])
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [missionsError, setMissionsError] = useState<string | null>(null)

  const chargerMissions = () => {
    if (!user) return
    setLoadingMissions(true)
    setMissionsError(null)
    fetchMissionsAgent(user.id)
      .then(setMissions)
      .catch((err) => setMissionsError(err instanceof Error ? err.message : 'Impossible de charger les missions.'))
      .finally(() => setLoadingMissions(false))
  }

  useEffect(() => {
    fetchProduitsCatalogue()
      .then(setCatalogue)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Impossible de charger les données.'))
  }, [])

  useEffect(() => {
    chargerMissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const actives = missions.filter((m) => m.statut === 'a_faire' || m.statut === 'en_cours')
  const enAttente = missions.filter((m) => m.statut === 'en_attente_validation')
  const refusees = missions.filter((m) => m.statut === 'non_conforme')
  const refuseesNonVues = refusees.some((m) => m.refus?.some((r) => !r.vu))

  const counts: Partial<Record<Onglet, number>> = {
    'mes-missions': actives.length,
    'en-attente': enAttente.length,
    refusees: refusees.length,
  }

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <div className="flex min-h-screen bg-app-bg font-sans text-ink">
      <nav
        className="flex w-[246px] shrink-0 flex-col bg-marine px-3.5 py-5"
        role="tablist"
        aria-label="Navigation agent ménage"
      >
        <div className="flex items-center gap-2.5 px-1 pb-5">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-field bg-white">
            <img src="/logo.png" alt="" className="h-[34px] w-[34px] object-contain" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-white">Restinnov</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-rail-meta">Agent ménage</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {ONGLETS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={onglet === o.id}
              onClick={() => setOnglet(o.id)}
              className={`relative flex items-center gap-2.5 rounded-[10px] px-3 py-3 text-left text-[15px] font-semibold ${
                onglet === o.id ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
              }`}
            >
              <span aria-hidden="true" className="text-lg">
                {o.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {counts[o.id] !== undefined && (
                <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-white/15 px-1.5 font-mono text-xs font-bold text-white">
                  {counts[o.id]}
                </span>
              )}
              {o.id === 'refusees' && refuseesNonVues && (
                <span
                  data-testid="refusees-dot"
                  role="status"
                  aria-label="Nouveau refus"
                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger"
                />
              )}
            </button>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {user && (
            <div className="flex items-center gap-2.5 border-t border-marine-border px-1 pt-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {initiales(user.nom)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#E6EBF4]">{user.nom}</div>
                <div className="text-[11px] text-rail-meta">Agent ménage</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              void logout()
            }}
            aria-label="Déconnexion"
            className="flex min-h-12 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-rail-text hover:bg-white/5"
          >
            <span aria-hidden="true" className="text-lg">
              🚪
            </span>
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-4 border-b border-border-default bg-surface px-6">
          <div>
            <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">Ménage</h1>
            <p dir="rtl" className="font-arabic text-sm text-ink-tertiary">
              النظافة
            </p>
          </div>
          <div className="border-l border-border-default pl-4 text-[13px] text-ink-tertiary">{todayCapitalized}</div>
          <div className="ml-auto flex h-10 items-center gap-2 rounded-field bg-success-bg px-3 text-xs font-bold text-success-text">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
            Tout est synchronisé
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}

          {onglet === 'mes-missions' && (
            <MesMissionsSection
              missions={actives}
              catalogue={catalogue}
              loading={loadingMissions}
              error={missionsError}
              heading="Mes missions du jour"
              subheading={user?.nom}
              emptyIcon="✅"
              emptyMessage="Aucune mission pour l'instant."
              onRefresh={chargerMissions}
            />
          )}
          {onglet === 'en-attente' && (
            <MesMissionsSection
              missions={enAttente}
              catalogue={catalogue}
              loading={loadingMissions}
              error={missionsError}
              emptyIcon="⏳"
              emptyMessage="Aucune mission en attente de validation."
              onRefresh={chargerMissions}
            />
          )}
          {onglet === 'refusees' && (
            <MesMissionsSection
              missions={refusees}
              catalogue={catalogue}
              loading={loadingMissions}
              error={missionsError}
              emptyIcon="🎉"
              emptyMessage="Aucune mission refusée."
              onRefresh={chargerMissions}
            />
          )}
          {onglet === 'validees' && <HistoriqueAgentSection />}
        </main>
      </div>
    </div>
  )
}
