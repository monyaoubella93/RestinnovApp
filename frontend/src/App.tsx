import { useEffect, useState } from 'react'
import {
  checkoutSejour,
  createAppartement,
  createChecklistModele,
  createChecklistModeleItem,
  createProduitCatalogue,
  createProprietaire,
  createSejour,
  createUtilisateur,
  deleteChecklistModeleItem,
  deplacerChecklistModeleItem,
  fetchAppartements,
  fetchChecklistModeles,
  fetchDashboard,
  fetchProduitsCatalogue,
  fetchProduitsSignales,
  fetchProprietaires,
  fetchUtilisateurs,
  rejeterProduitSignale,
  updateAppartement,
  updateSejour,
  updateUtilisateur,
  validerProduitSignale,
  type NewAppartementInput,
  type NewProduitCatalogueInput,
  type NewProprietaireInput,
  type NewSejourInput,
  type NewUtilisateurInput,
  type ValiderProduitSignaleInput,
} from './api'
import { AgentsMenageListeSection } from './components/AgentsMenageListeSection'
import { AppartementsListeSection } from './components/AppartementsListeSection'
import { CalendrierSection } from './components/CalendrierSection'
import { CatalogueProduitsSection } from './components/CatalogueProduitsSection'
import { DashboardSection } from './components/DashboardSection'
import { HeaderSearchBar } from './components/HeaderSearchBar'
import { HistoriqueMenageSection } from './components/HistoriqueMenageSection'
import { NotificationBell } from './components/NotificationBell'
import { NouveauSejourForm } from './components/NouveauSejourForm'
import { NouvelAgentForm } from './components/NouvelAgentForm'
import { NouvelAgentMaintenanceForm } from './components/NouvelAgentMaintenanceForm'
import { NouvelAppartementForm } from './components/NouvelAppartementForm'
import { ProduitsSignalesSection } from './components/ProduitsSignalesSection'
import { SejoursListeSection } from './components/SejoursListeSection'
import { TicketsMaintenanceSection } from './components/TicketsMaintenanceSection'
import { useAuth } from './auth/AuthContext'
import { usePwaIdentity } from './pwa/usePwaIdentity'
import type {
  Agent,
  Appartement,
  ChecklistModele,
  DashboardData,
  ProduitCatalogue,
  ProduitMenageSignale,
  Proprietaire,
  Sejour,
  SejourStatut,
  TicketMaintenanceStatut,
} from './types'

type Tab =
  | 'dashboard'
  | 'calendrier'
  | 'sejour-creer'
  | 'sejour-liste'
  | 'appartement-creer'
  | 'appartement-liste'
  | 'menage-agent'
  | 'menage-agents-liste'
  | 'menage-catalogue'
  | 'menage-historique'
  | 'maintenance-agent'
  | 'maintenance-tickets'

interface NavGroup {
  key: string
  label: string
  tabs: [Tab, string][]
  defaultTab: Tab
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'sejours',
    label: 'Séjours',
    tabs: [
      ['sejour-creer', 'Créer un séjour'],
      ['sejour-liste', 'Liste des séjours'],
    ],
    defaultTab: 'sejour-liste',
  },
  {
    key: 'appartements',
    label: 'Appartements',
    tabs: [
      ['appartement-creer', 'Créer un appartement'],
      ['appartement-liste', 'Liste des appartements'],
    ],
    defaultTab: 'appartement-liste',
  },
  {
    key: 'menage',
    label: 'Ménage',
    tabs: [
      ['menage-agent', 'Ajouter un agent ménage'],
      ['menage-agents-liste', 'Liste des agents'],
      ['menage-catalogue', 'Catalogue ménage'],
      ['menage-historique', 'Historique'],
    ],
    defaultTab: 'menage-agent',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    tabs: [
      ['maintenance-agent', 'Ajouter un agent maintenance'],
      ['maintenance-tickets', 'Tickets de maintenance'],
    ],
    defaultTab: 'maintenance-agent',
  },
]

const SECTION_TITLES: Record<Tab, string> = {
  dashboard: 'Dashboard',
  calendrier: 'Calendrier',
  'sejour-creer': 'Séjours',
  'sejour-liste': 'Séjours',
  'appartement-creer': 'Appartements',
  'appartement-liste': 'Appartements',
  'menage-agent': 'Ménage',
  'menage-agents-liste': 'Ménage',
  'menage-catalogue': 'Ménage',
  'menage-historique': 'Ménage',
  'maintenance-agent': 'Maintenance',
  'maintenance-tickets': 'Maintenance',
}

function groupKeyForTab(tab: Tab): string | null {
  return NAV_GROUPS.find((group) => group.tabs.some(([t]) => t === tab))?.key ?? null
}

function App() {
  const [appartements, setAppartements] = useState<Appartement[]>([])
  const [proprietaires, setProprietaires] = useState<Proprietaire[]>([])
  const [checklistModeles, setChecklistModeles] = useState<ChecklistModele[]>([])
  const [agentsMenage, setAgentsMenage] = useState<Agent[]>([])
  const [produitsCatalogue, setProduitsCatalogue] = useState<ProduitCatalogue[]>([])
  const [produitsSignales, setProduitsSignales] = useState<ProduitMenageSignale[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [editingSejour, setEditingSejour] = useState<Sejour | null>(null)
  const [editingAppartement, setEditingAppartement] = useState<Appartement | null>(null)
  const [editingUtilisateur, setEditingUtilisateur] = useState<Agent | null>(null)
  const [pendingSejourId, setPendingSejourId] = useState<number | null>(null)
  const [pendingAppartementDetail, setPendingAppartementDetail] = useState<Appartement | null>(null)
  const [pendingStatutFilter, setPendingStatutFilter] = useState<SejourStatut | ''>('')
  const [pendingTicketStatutFilter, setPendingTicketStatutFilter] = useState<TicketMaintenanceStatut | ''>('')
  const { user, logout } = useAuth()

  usePwaIdentity('manager')

  const navigateTo = (tab: Tab) => {
    setActiveTab(tab)
    setExpandedGroup(groupKeyForTab(tab))
    setPendingSejourId(null)
    setPendingAppartementDetail(null)
    setPendingStatutFilter('')
    setPendingTicketStatutFilter('')
  }

  const handleNavigateToSejourDetail = (sejourId: number) => {
    navigateTo('sejour-liste')
    setPendingSejourId(sejourId)
  }

  const handleNavigateToAppartementDetail = (appartement: Appartement) => {
    navigateTo('appartement-liste')
    setPendingAppartementDetail(appartement)
  }

  const handleNavigateToSejoursListe = (statut?: SejourStatut) => {
    navigateTo('sejour-liste')
    if (statut) setPendingStatutFilter(statut)
  }

  const handleNavigateToTicketsMaintenance = (statut?: TicketMaintenanceStatut) => {
    navigateTo('maintenance-tickets')
    if (statut) setPendingTicketStatutFilter(statut)
  }

  const loadData = async () => {
    setLoadError(null)
    try {
      const [
        appartementsData,
        proprietairesData,
        checklistModelesData,
        agentsMenageData,
        produitsCatalogueData,
        produitsSignalesData,
      ] = await Promise.all([
        fetchAppartements(),
        fetchProprietaires(),
        fetchChecklistModeles(),
        fetchUtilisateurs({ role: 'menage' }),
        fetchProduitsCatalogue(),
        fetchProduitsSignales('en_attente'),
      ])
      setAppartements(appartementsData)
      setProprietaires(proprietairesData)
      setChecklistModeles(checklistModelesData)
      setAgentsMenage(agentsMenageData)
      setProduitsCatalogue(produitsCatalogueData)
      setProduitsSignales(produitsSignalesData)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les données.')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab !== 'dashboard') return

    let cancelled = false
    setDashboardError(null)
    setDashboardLoading(true)
    fetchDashboard()
      .then((data) => {
        if (!cancelled) setDashboardData(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setDashboardError(err instanceof Error ? err.message : 'Impossible de charger le dashboard.')
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab])

  // Used after a checkout from the Dashboard's "Départs prévus aujourd'hui"
  // banner, so the departed sejour disappears from the list right away
  // instead of waiting for the next tab switch.
  const handleDashboardCheckout = async (sejourId: number) => {
    await checkoutSejour(sejourId)
    const data = await fetchDashboard()
    setDashboardData(data)
  }

  // Refresh the appartement list every time "Nouveau séjour" opens, so its
  // selector reflects the current computed statut (an appartement excluded
  // for being "maintenance" must disappear as soon as that becomes true,
  // not just at initial page load).
  useEffect(() => {
    if (activeTab !== 'sejour-creer') return

    let cancelled = false
    fetchAppartements()
      .then((data) => {
        if (!cancelled) setAppartements(data)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeTab])

  const handleSubmitSejour = async (input: NewSejourInput) => {
    if (editingSejour) {
      await updateSejour(editingSejour.id, input)
      setEditingSejour(null)
    } else {
      await createSejour(input)
    }
    navigateTo('sejour-liste')
  }

  const handleCancelSejourForm = () => {
    if (editingSejour) {
      setEditingSejour(null)
      navigateTo('sejour-liste')
    }
  }

  const handleEditSejour = (sejour: Sejour) => {
    setEditingSejour(sejour)
    navigateTo('sejour-creer')
  }

  const handleSubmitAppartement = async (input: NewAppartementInput) => {
    if (editingAppartement) {
      const appartement = await updateAppartement(editingAppartement.id, input)
      setAppartements((current) =>
        current.map((a) => (a.id === appartement.id ? appartement : a)).sort((a, b) => a.nom.localeCompare(b.nom)),
      )
      setEditingAppartement(null)
    } else {
      const appartement = await createAppartement(input)
      setAppartements((current) => [...current, appartement].sort((a, b) => a.nom.localeCompare(b.nom)))
    }
    navigateTo('appartement-liste')
  }

  const handleCancelAppartementForm = () => {
    if (editingAppartement) {
      setEditingAppartement(null)
      navigateTo('appartement-liste')
    }
  }

  const handleEditAppartement = (appartement: Appartement) => {
    setEditingAppartement(appartement)
    navigateTo('appartement-creer')
  }

  const handleCreateProprietaire = async (input: NewProprietaireInput) => {
    const proprietaire = await createProprietaire(input)
    setProprietaires((current) => [...current, proprietaire].sort((a, b) => a.nom.localeCompare(b.nom)))
    return proprietaire
  }

  const handleCreateChecklistModele = async (nom: string) => {
    const modele = await createChecklistModele(nom)
    setChecklistModeles((current) => [...current, modele].sort((a, b) => a.nom.localeCompare(b.nom)))
    return modele
  }

  const handleAddChecklistModeleItem = async (checklistModeleId: number, libelle: string, photo?: File | null) => {
    const item = await createChecklistModeleItem(checklistModeleId, libelle, photo)
    setChecklistModeles((current) =>
      current.map((m) => (m.id === checklistModeleId ? { ...m, items: [...(m.items ?? []), item] } : m)),
    )
  }

  const handleDeplacerChecklistModeleItem = async (itemId: number, direction: 'haut' | 'bas') => {
    const updatedItems = await deplacerChecklistModeleItem(itemId, direction)
    const checklistModeleId = updatedItems[0]?.checklist_modele_id
    if (checklistModeleId == null) return
    setChecklistModeles((current) => current.map((m) => (m.id === checklistModeleId ? { ...m, items: updatedItems } : m)))
  }

  const handleDeleteChecklistModeleItem = async (itemId: number) => {
    await deleteChecklistModeleItem(itemId)
    setChecklistModeles((current) =>
      current.map((m) => ({ ...m, items: (m.items ?? []).filter((i) => i.id !== itemId) })),
    )
  }

  const handleCreateUtilisateur = async (input: NewUtilisateurInput) => {
    const agent = await createUtilisateur(input)
    if (agent.role === 'menage') {
      setAgentsMenage((current) => [...current, agent].sort((a, b) => a.nom.localeCompare(b.nom)))
    }

    const assignedIds = input.appartement_ids ?? []
    if (assignedIds.length > 0) {
      setAppartements((current) =>
        current.map((appartement) =>
          assignedIds.includes(appartement.id)
            ? { ...appartement, agent_habituel_id: agent.id, agent_habituel: agent }
            : appartement,
        ),
      )
    }
  }

  const handleSubmitUtilisateur = async (input: NewUtilisateurInput) => {
    if (editingUtilisateur) {
      const updated = await updateUtilisateur(editingUtilisateur.id, {
        nom: input.nom,
        telephone: input.telephone,
        adresse: input.adresse ?? null,
        password: input.password ?? null,
      })
      setAgentsMenage((current) =>
        current.map((a) => (a.id === updated.id ? updated : a)).sort((a, b) => a.nom.localeCompare(b.nom)),
      )
      setEditingUtilisateur(null)
      navigateTo('menage-agents-liste')
    } else {
      await handleCreateUtilisateur(input)
    }
  }

  const handleCancelUtilisateurForm = () => {
    if (editingUtilisateur) {
      setEditingUtilisateur(null)
      navigateTo('menage-agents-liste')
    }
  }

  const handleEditUtilisateur = (agent: Agent) => {
    setEditingUtilisateur(agent)
    navigateTo('menage-agent')
  }

  const handleCreateProduitCatalogue = async (input: NewProduitCatalogueInput) => {
    const produit = await createProduitCatalogue(input)
    setProduitsCatalogue((current) => [...current, produit].sort((a, b) => a.nom.localeCompare(b.nom)))
  }

  const handleValiderProduitSignale = async (id: number, input: ValiderProduitSignaleInput) => {
    const updated = await validerProduitSignale(id, input)
    setProduitsSignales((current) => current.filter((p) => p.id !== id))

    const nouveauProduit = updated.produit_catalogue
    if (nouveauProduit) {
      setProduitsCatalogue((current) => [...current, nouveauProduit].sort((a, b) => a.nom.localeCompare(b.nom)))
    }
  }

  const handleRejeterProduitSignale = async (id: number) => {
    await rejeterProduitSignale(id)
    setProduitsSignales((current) => current.filter((p) => p.id !== id))
  }

  // Both the sidebar sub-item clicks and toggleGroup's default-tab jump can
  // land directly on a create/edit tab without going through the dedicated
  // "+ Nouveau"/pencil handlers (setEditingX(...) + navigateTo(...)) that
  // normally keep a "creer" tab's form in sync with what's highlighted.
  // Without this, e.g. clicking "Créer un séjour" directly while an edit
  // was in progress left editingSejour set, so the form still showed
  // "Modifier le séjour" -- highlighted entry and displayed screen no
  // longer matched. "menage-agent" is included because it's also the
  // "menage" group's defaultTab, so toggleGroup can jump there too.
  const clearEditingStateFor = (tab: Tab) => {
    if (tab === 'sejour-creer') setEditingSejour(null)
    if (tab === 'appartement-creer') setEditingAppartement(null)
    if (tab === 'menage-agent') setEditingUtilisateur(null)
  }

  const handleSidebarNavigate = (tab: Tab) => {
    clearEditingStateFor(tab)
    navigateTo(tab)
  }

  const toggleGroup = (group: NavGroup) => {
    if (expandedGroup === group.key) {
      setExpandedGroup(null)
      return
    }

    setExpandedGroup(group.key)
    if (groupKeyForTab(activeTab) !== group.key) {
      clearEditingStateFor(group.defaultTab)
      setActiveTab(group.defaultTab)
    }
  }

  const menagesAValiderCount = dashboardData?.menages_a_valider.length ?? 0
  const urgencesMaintenanceCount = dashboardData?.problemes_signales.length ?? 0

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1)

  const railGroupCounter = (groupKey: string) => {
    if (groupKey === 'appartements') {
      return <span className="font-mono text-[11px] font-bold text-rail-meta">{appartements.length}</span>
    }
    if (groupKey === 'menage' && menagesAValiderCount > 0) {
      return (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-badge bg-warning px-1.5 text-[11px] font-bold text-white">
          {menagesAValiderCount}
        </span>
      )
    }
    if (groupKey === 'maintenance' && urgencesMaintenanceCount > 0) {
      return (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-badge bg-danger px-1.5 text-[11px] font-bold text-white">
          {urgencesMaintenanceCount}
        </span>
      )
    }
    return null
  }

  return (
    <div className="flex min-h-screen bg-app-bg font-sans text-ink">
      <nav className="flex w-[246px] shrink-0 flex-col bg-marine px-3.5 py-5">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <div className="flex h-[38px] w-fit shrink-0 items-center justify-center rounded-[10px] bg-white px-2">
            <img src="/logo.png" alt="RestInnov" className="h-[26px] w-auto object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-bold tracking-[-0.01em] text-white">Restinnov</div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-rail-meta">Conciergerie</div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rail-group-title">
            Pilotage
          </div>
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className={`flex items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-sm font-semibold ${
              activeTab === 'dashboard' ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigateTo('calendrier')}
            className={`flex items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-sm font-semibold ${
              activeTab === 'calendrier' ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
            }`}
          >
            Calendrier
          </button>

          {NAV_GROUPS.slice(0, 2).map((group) => {
            const isExpanded = expandedGroup === group.key
            const isActiveGroup = groupKeyForTab(activeTab) === group.key

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={isExpanded}
                  aria-label={group.label}
                  className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-sm font-semibold ${
                    isActiveGroup ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
                  }`}
                >
                  <span className="flex-1">{group.label}</span>
                  {railGroupCounter(group.key)}
                  <span className="text-xs" aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                    {group.tabs.map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => handleSidebarNavigate(tab)}
                        className={`block w-full rounded-field px-2.5 py-2 text-left text-[13px] ${
                          activeTab === tab ? 'bg-brand font-semibold text-white' : 'text-rail-text hover:bg-white/5'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-rail-group-title">
            Opérations
          </div>
          {NAV_GROUPS.slice(2, 4).map((group) => {
            const isExpanded = expandedGroup === group.key
            const isActiveGroup = groupKeyForTab(activeTab) === group.key

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={isExpanded}
                  aria-label={group.label}
                  className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-sm font-semibold ${
                    isActiveGroup ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
                  }`}
                >
                  <span className="flex-1">{group.label}</span>
                  {railGroupCounter(group.key)}
                  <span className="text-xs" aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                    {group.tabs.map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => handleSidebarNavigate(tab)}
                        className={`block w-full rounded-field px-2.5 py-2 text-left text-[13px] ${
                          activeTab === tab ? 'bg-brand font-semibold text-white' : 'text-rail-text hover:bg-white/5'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {user && (
            <div className="flex items-center gap-2.5 border-t border-marine-border px-2.5 pt-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {user.nom
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#E6EBF4]">{user.nom}</div>
                <div className="text-[11px] text-rail-meta">Manager</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              void logout()
            }}
            className="flex items-center gap-2.5 rounded-field px-2.5 py-2.5 text-left text-sm font-semibold text-rail-text hover:bg-white/5"
          >
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-default bg-surface px-6">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">{SECTION_TITLES[activeTab]}</h2>
          <div className="border-l border-border-default pl-4 text-[13px] text-ink-tertiary">{todayCapitalized}</div>
          <div className="ml-auto flex items-center gap-2.5">
            <HeaderSearchBar
              onNavigateToSejour={handleNavigateToSejourDetail}
              onNavigateToAppartement={handleNavigateToAppartementDetail}
            />
            <NotificationBell
              onNavigateToSejour={handleNavigateToSejourDetail}
              onNavigateToTicketsMaintenance={() => handleNavigateToTicketsMaintenance('ouvert')}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}

          <div className="space-y-6">
          {activeTab === 'dashboard' && (
            <DashboardSection
              data={dashboardData}
              loading={dashboardLoading}
              error={dashboardError}
              onNavigateToAppartements={() => navigateTo('appartement-liste')}
              onNavigateToSejour={handleNavigateToSejourDetail}
              onNavigateToSejoursListe={handleNavigateToSejoursListe}
              onCheckout={handleDashboardCheckout}
              onNavigateToTicketsMaintenance={() => handleNavigateToTicketsMaintenance('ouvert')}
              onNavigateToResolutionsAValider={() => handleNavigateToTicketsMaintenance('resolu_en_attente_validation')}
            />
          )}
          {activeTab === 'calendrier' && (
            <CalendrierSection appartements={appartements} onNavigateToSejour={handleNavigateToSejourDetail} />
          )}
          {activeTab === 'sejour-creer' && (
            <NouveauSejourForm
              appartements={appartements}
              onSubmit={handleSubmitSejour}
              onCancel={handleCancelSejourForm}
              sejourToEdit={editingSejour}
            />
          )}
          {activeTab === 'sejour-liste' && (
            <SejoursListeSection
              appartements={appartements}
              catalogue={produitsCatalogue}
              onNavigateToCreer={() => {
                setEditingSejour(null)
                navigateTo('sejour-creer')
              }}
              onEditSejour={handleEditSejour}
              initialSejourId={pendingSejourId}
              initialStatutFilter={pendingStatutFilter}
            />
          )}
          {activeTab === 'appartement-creer' && (
            <NouvelAppartementForm
              checklistModeles={checklistModeles}
              agentsMenage={agentsMenage}
              proprietaires={proprietaires}
              onSubmit={handleSubmitAppartement}
              onCreateProprietaire={handleCreateProprietaire}
              onCreateChecklistModele={handleCreateChecklistModele}
              onAddChecklistModeleItem={handleAddChecklistModeleItem}
              onDeplacerChecklistModeleItem={handleDeplacerChecklistModeleItem}
              onDeleteChecklistModeleItem={handleDeleteChecklistModeleItem}
              onCancel={handleCancelAppartementForm}
              appartementToEdit={editingAppartement}
            />
          )}
          {activeTab === 'appartement-liste' && (
            <AppartementsListeSection
              onNavigateToCreer={() => {
                setEditingAppartement(null)
                navigateTo('appartement-creer')
              }}
              onEditAppartement={handleEditAppartement}
              initialAppartement={pendingAppartementDetail}
            />
          )}
          {activeTab === 'menage-agent' && (
            <NouvelAgentForm
              appartements={appartements}
              onSubmit={handleSubmitUtilisateur}
              onCancel={handleCancelUtilisateurForm}
              agentToEdit={editingUtilisateur}
            />
          )}
          {activeTab === 'menage-agents-liste' && (
            <AgentsMenageListeSection onEditAgent={handleEditUtilisateur} onAgentsChanged={loadData} />
          )}
          {activeTab === 'menage-catalogue' && (
            <>
              <CatalogueProduitsSection catalogue={produitsCatalogue} onCreate={handleCreateProduitCatalogue} />
              <ProduitsSignalesSection
                produitsSignales={produitsSignales}
                onValider={handleValiderProduitSignale}
                onRejeter={handleRejeterProduitSignale}
              />
            </>
          )}
          {activeTab === 'menage-historique' && <HistoriqueMenageSection appartements={appartements} />}
          {activeTab === 'maintenance-agent' && (
            <NouvelAgentMaintenanceForm onSubmit={handleCreateUtilisateur} />
          )}
          {activeTab === 'maintenance-tickets' && (
            <TicketsMaintenanceSection appartements={appartements} initialStatutFilter={pendingTicketStatutFilter} />
          )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
