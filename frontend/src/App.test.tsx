import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import type { Appartement, DashboardData, PaginatedResponse, Sejour } from './types'

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )
}

const appartement: Appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: '12 rue de la Roquette',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

function sejourFixture(overrides: Partial<Sejour> = {}): Sejour {
  return {
    id: 1,
    reference: 'SEJ-0001',
    appartement_id: 1,
    date_arrivee: '2026-08-01',
    date_depart: '2026-08-05',
    nom_voyageur: 'Jean Dupont',
    statut: 'a_venir',
    plateforme_origine: 'airbnb',
    montant_mad: 0,
    appartement,
    mission_menage: null,
    voyageurs: [{ nom: 'Jean Dupont', numero_passeport: null, telephone: null, est_principal: true, type: 'adulte' }],
    voyageurs_count: 1,
    ...overrides,
  }
}

function paginate<T>(data: T[]): PaginatedResponse<T> {
  return { data, current_page: 1, last_page: 1, per_page: 10, total: data.length }
}

function dashboardFixture(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    revenus_totaux: 1800,
    frais_menage_totaux: 100,
    frais_maintenance_totaux: 350,
    resultat_net: 1350,
    appartements: [
      { id: 1, nom: 'Loft Bastille', statut: 'disponible', sejours_count: 2, dernier_sejour: '2026-03-05' },
    ],
    sejours_par_statut: { a_venir: 1, en_cours: 0, termine: 2 },
    sejours_recents: [
      { id: 1, nom_voyageur: 'Jean Dupont', date_arrivee: '2026-08-01', statut: 'a_venir', appartement: { id: 1, nom: 'Loft Bastille' } },
    ],
    departs_aujourdhui: [],
    problemes_signales: [],
    menages_a_valider: [],
    resolutions_a_valider: [],
    ...overrides,
  }
}

function mockFetch(handlers: {
  onCreateSejour?: () => Sejour
  onUpdateSejour?: () => Sejour
  onCheckout?: () => { sejour: Sejour; mission_menage: Sejour['mission_menage'] }
  onCreateUtilisateur?: () => unknown
  onUpdateUtilisateur?: () => unknown
  onUpdateAppartement?: () => Appartement
  sejours?: Sejour[]
  appartements?: Appartement[]
  agentsMenage?: unknown[]
  dashboard?: DashboardData
}) {
  const sejours = handlers.sejours ?? []
  let appartements = handlers.appartements ?? [appartement]
  let agentsMenage = handlers.agentsMenage ?? []
  const dashboard = handlers.dashboard ?? dashboardFixture()
  let lastMissionMenage: Sejour['mission_menage'] = null

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlObj = new URL(String(input))
    const url = urlObj.pathname
    const method = init?.method ?? 'GET'

    if (url === '/api/appartements' && method === 'GET') {
      if (urlObj.searchParams.has('page') || urlObj.searchParams.has('per_page')) {
        return new Response(JSON.stringify(paginate(appartements)), { status: 200 })
      }
      return new Response(JSON.stringify(appartements), { status: 200 })
    }

    if (url === '/api/appartements' && method === 'POST') {
      const created = { id: 99, nom: 'Nouvel appartement', adresse: 'A', statut: 'disponible' } as Appartement
      appartements = [...appartements, created]
      return new Response(JSON.stringify(created), { status: 201 })
    }

    if (/^\/api\/appartements\/\d+$/.test(url) && (method === 'PATCH' || method === 'POST')) {
      const id = Number(url.split('/').pop())
      const updated =
        handlers.onUpdateAppartement?.() ?? { ...appartement, id, nom: 'Loft Bastille modifié' }
      appartements = appartements.map((a) => (a.id === id ? updated : a))
      return new Response(JSON.stringify(updated), { status: 200 })
    }

    if (url === '/api/checklist-modeles' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/proprietaires' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (/^\/api\/appartements\/\d+\/releve$/.test(url) && method === 'GET') {
      const id = Number(url.split('/')[3])
      return new Response(
        JSON.stringify({
          appartement: { id, nom: 'Loft Bastille', adresse: 'A', mode_gestion: 'mandat', taux_commission: null, loyer_fixe_mensuel: null, proprietaire: null },
          mois: urlObj.searchParams.get('mois'),
          revenus_bruts: 0,
          frais_menage_total: 0,
          frais_maintenance_total: 0,
          resultat_net: 0,
          montant_proprietaire: 0,
          commission_restinnov: 0,
          sejours: [],
          frais_menage_detail: [],
          frais_maintenance_detail: [],
        }),
        { status: 200 },
      )
    }

    if (url === '/api/utilisateurs' && method === 'GET') {
      return new Response(JSON.stringify(agentsMenage), { status: 200 })
    }

    if (url === '/api/utilisateurs' && method === 'POST') {
      const created =
        handlers.onCreateUtilisateur?.() ?? { id: 42, nom: 'Fatima Zahra', role: 'menage', telephone: null }
      agentsMenage = [...agentsMenage, created]
      return new Response(JSON.stringify(created), { status: 201 })
    }

    if (/^\/api\/utilisateurs\/\d+$/.test(url) && method === 'PATCH') {
      const id = Number(url.split('/').pop())
      const updated = handlers.onUpdateUtilisateur?.() ?? {
        id,
        nom: 'Fatima Zahra modifiée',
        role: 'menage',
        telephone: null,
        adresse: null,
        actif: true,
      }
      agentsMenage = agentsMenage.map((a) => ((a as { id: number }).id === id ? updated : a))
      return new Response(JSON.stringify(updated), { status: 200 })
    }

    if (url === '/api/produits-catalogue' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/produits-signales' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/dashboard' && method === 'GET') {
      return new Response(JSON.stringify(dashboard), { status: 200 })
    }

    if (url === '/api/notifications' && method === 'GET') {
      return new Response(
        JSON.stringify({
          menages_a_valider_count: 0,
          problemes_signales_count: 0,
          menages_a_valider: [],
          problemes_signales: [],
        }),
        { status: 200 },
      )
    }

    if (url === '/api/sejours' && method === 'GET') {
      return new Response(JSON.stringify(paginate(sejours)), { status: 200 })
    }

    if (url === '/api/sejours' && method === 'POST') {
      const created = handlers.onCreateSejour?.() ?? sejourFixture()
      return new Response(JSON.stringify(created), { status: 201 })
    }

    if (/^\/api\/sejours\/\d+$/.test(url) && method === 'PATCH') {
      const updated = handlers.onUpdateSejour?.() ?? sejourFixture({ date_arrivee: '2026-09-01' })
      return new Response(JSON.stringify(updated), { status: 200 })
    }

    if (/^\/api\/sejours\/\d+$/.test(url) && method === 'GET') {
      const id = Number(url.split('/').pop())
      const found = sejours.find((s) => s.id === id) ?? sejourFixture({ id })
      return new Response(JSON.stringify(found), { status: 200 })
    }

    if (url.includes('/checkout') && method === 'PATCH') {
      const result = handlers.onCheckout?.() ?? {
        sejour: sejourFixture({ statut: 'termine' }),
        mission_menage: null,
      }
      lastMissionMenage = result.mission_menage
      return new Response(JSON.stringify(result), { status: 200 })
    }

    if (/^\/api\/mission-menages\/\d+\/vue$/.test(url) && method === 'PATCH') {
      const updated = lastMissionMenage ? { ...lastMissionMenage, vue: true } : {}
      return new Response(JSON.stringify(updated), { status: 200 })
    }

    if (url === '/api/mission-menages/historique' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/mission-menages/a-valider' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/tickets-maintenance' && method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 })
    }

    if (url === '/api/logout' && method === 'POST') {
      return new Response(JSON.stringify({ message: 'Déconnecté.' }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url}`)
  })
}

function openGroup(user: ReturnType<typeof userEvent.setup>, groupLabel: string) {
  return user.click(screen.getByRole('button', { name: groupLabel }))
}

function openSubItem(user: ReturnType<typeof userEvent.setup>, label: string) {
  return user.click(screen.getByRole('button', { name: label }))
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'fake-token')
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, nom: 'Nadia M.', role: 'manager' }))
  })

  it('affiche Dashboard comme écran par défaut avec les 4 groupes de menu repliés', async () => {
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()

    expect(await screen.findByTestId('dashboard-revenus-totaux')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard', level: 2 })).toBeInTheDocument()

    for (const label of ['Séjours', 'Appartements', 'Ménage', 'Maintenance']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Créer un séjour' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un agent ménage' })).not.toBeInTheDocument()
  })

  it('déplie le sous-menu Séjours et navigue vers Liste des séjours par défaut', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [sejourFixture()] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    expect(screen.getByRole('button', { name: 'Créer un séjour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liste des séjours' })).toBeInTheDocument()
    expect(await screen.findByText('Jean Dupont')).toBeInTheDocument()
  })

  it('replie le sous-menu Séjours au second clic sur le groupe', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')
    expect(screen.getByRole('button', { name: 'Créer un séjour' })).toBeInTheDocument()

    await openGroup(user, 'Séjours')
    expect(screen.queryByRole('button', { name: 'Créer un séjour' })).not.toBeInTheDocument()
  })

  it('crée un séjour via "Créer un séjour" puis bascule vers la liste', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      onCreateSejour: () => sejourFixture({ id: 2, nom_voyageur: 'Marie Curie' }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')
    await openSubItem(user, 'Créer un séjour')

    const select = await screen.findByRole('combobox', { name: /Appartement/i })
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2))

    await user.selectOptions(select, '1')
    await user.type(screen.getByLabelText(/Date d'arrivée/i), '2026-08-01')
    await user.type(screen.getByLabelText(/Date de départ/i), '2026-08-05')
    await user.type(screen.getByLabelText('Nom'), 'Marie Curie')
    await user.click(screen.getByRole('button', { name: /enregistrer le séjour/i }))

    expect(await screen.findByRole('button', { name: 'Liste des séjours' })).toHaveClass(/bg-brand/)
  })

  it('modifie un séjour à venir via l\'icône crayon, préremplit le formulaire', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [sejourFixture({ statut: 'a_venir' })],
      onUpdateSejour: () => sejourFixture({ date_arrivee: '2026-09-01' }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    const editButton = await screen.findByRole('button', { name: /modifier le séjour de jean dupont/i })
    await user.click(editButton)

    expect(await screen.findByRole('heading', { name: 'Modifier le séjour' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Date d'arrivée/i)).toHaveValue('2026-08-01')
    expect(screen.getByRole('button', { name: /enregistrer les modifications/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sejours/1'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
  })

  it('l\'entrée surlignée correspond toujours à l\'écran affiché : "Créer un séjour" après édition puis clic direct dans le menu', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [sejourFixture({ statut: 'a_venir' })] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    await user.click(await screen.findByRole('button', { name: /modifier le séjour de jean dupont/i }))
    expect(await screen.findByRole('heading', { name: 'Modifier le séjour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un séjour' })).toHaveClass(/bg-brand/)

    // Direct sidebar click (not "Annuler", not "+ Nouveau séjour") must
    // still reset the pending edit -- otherwise "Créer un séjour" stays
    // highlighted while the form silently keeps showing "Modifier le séjour".
    await user.click(screen.getByRole('button', { name: 'Créer un séjour' }))

    expect(await screen.findByRole('heading', { name: 'Nouveau séjour' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Date d'arrivée/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Créer un séjour' })).toHaveClass(/bg-brand/)
  })

  it('désactive l\'icône crayon pour un séjour déjà terminé', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [sejourFixture({ statut: 'termine' })],
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    const editButton = await screen.findByRole('button', { name: /modifier le séjour de jean dupont/i })
    expect(editButton).toBeDisabled()
  })

  it('déplie le sous-menu Appartements et crée un appartement', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [], appartements: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Appartements')

    expect(screen.getByRole('button', { name: 'Créer un appartement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liste des appartements' })).toBeInTheDocument()

    await openSubItem(user, 'Créer un appartement')
    expect(screen.getByLabelText(/nom d'appartement/i)).toBeInTheDocument()
  })

  it('affiche la liste des appartements avec compteur, puis modifie un appartement via le crayon', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      appartements: [appartement],
      onUpdateAppartement: () => ({ ...appartement, nom: 'Loft Bastille rénové' }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Appartements')
    await openSubItem(user, 'Liste des appartements')

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /modifier l'appartement loft bastille/i }))

    expect(await screen.findByRole('heading', { name: "Modifier l'appartement" })).toBeInTheDocument()
    expect(screen.getByLabelText(/nom d'appartement/i)).toHaveValue('Loft Bastille')

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/appartements/1'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('l\'entrée surlignée correspond toujours à l\'écran affiché : "Créer un appartement" après édition puis clic direct dans le menu', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [], appartements: [appartement] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Appartements')
    await openSubItem(user, 'Liste des appartements')
    await screen.findByText('Loft Bastille')

    await user.click(screen.getByRole('button', { name: /modifier l'appartement loft bastille/i }))
    expect(await screen.findByRole('heading', { name: "Modifier l'appartement" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un appartement' })).toHaveClass(/bg-brand/)

    await user.click(screen.getByRole('button', { name: 'Créer un appartement' }))

    expect(await screen.findByRole('heading', { name: 'Nouvel appartement' })).toBeInTheDocument()
    expect(screen.getByLabelText(/nom d'appartement/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Créer un appartement' })).toHaveClass(/bg-brand/)
  })

  it('l\'entrée surlignée correspond toujours à l\'écran affiché : formulaire agent vidé après édition puis retour via le groupe Ménage', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      agentsMenage: [
        { id: 7, nom: 'Fatima Zahra', role: 'menage', telephone: '0611111111', adresse: null, actif: true, appartements_habituel_count: 0, mission_menages_count: 0 },
      ],
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')
    await openSubItem(user, 'Liste des agents')
    await screen.findByText('Fatima Zahra')

    await user.click(screen.getByRole('button', { name: /modifier l'agent fatima zahra/i }))
    expect(await screen.findByRole('heading', { name: "Modifier l'agent de ménage" })).toBeInTheDocument()

    // Switch to a different group, then back via the "Ménage" PARENT header
    // -- toggleGroup's default-tab jump lands directly on the agent tab
    // ("menage-agent" is the group's defaultTab), which must also reset
    // the pending edit rather than keep showing "Modifier l'agent".
    await openGroup(user, 'Maintenance')
    await openGroup(user, 'Ménage')

    expect(await screen.findByRole('heading', { name: 'Nouvel agent de ménage' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('')
  })

  it('bascule vers "Liste des appartements" au clic sur une ligne du tableau du dashboard', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [], appartements: [appartement], dashboard: dashboardFixture() }) as typeof fetch

    renderApp()

    await screen.findByTestId('dashboard-revenus-totaux')
    // "Loft Bastille" also appears in the "Relevés propriétaires" block
    // further down the dashboard -- scope the click to the "Appartements"
    // table so it doesn't collide with that unrelated row.
    const appartementsHeading = screen.getByRole('heading', { name: 'Appartements' })
    await user.click(within(appartementsHeading.closest('div')!).getByText('Loft Bastille'))

    expect(await screen.findByText(/appartements trouvés/i)).toBeInTheDocument()
  })

  it('affiche directement le détail d\'un séjour au clic sur une ligne de "Séjours récents"', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [], dashboard: dashboardFixture() }) as typeof fetch

    renderApp()

    await screen.findByTestId('dashboard-revenus-totaux')
    await user.click(screen.getByRole('button', { name: /jean dupont/i }))

    expect(await screen.findByTestId('sejour-reference')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Liste des séjours' })).toHaveClass(/bg-brand/)
  })

  it('bascule vers la liste des séjours filtrée au clic sur une mini-carte de statut du dashboard', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [
        sejourFixture({ id: 1, statut: 'a_venir', nom_voyageur: 'Jean Dupont' }),
        sejourFixture({ id: 2, statut: 'termine', nom_voyageur: 'Marie Curie' }),
      ],
      dashboard: dashboardFixture(),
    }) as typeof fetch

    renderApp()

    await screen.findByTestId('dashboard-revenus-totaux')
    await user.click(screen.getByRole('button', { name: /1\s*à venir/i }))

    expect(await screen.findByRole('button', { name: 'Liste des séjours' })).toHaveClass(/bg-brand/)
    expect(screen.getByLabelText(/^statut$/i)).toHaveValue('a_venir')
  })

  it('regroupe "Ajouter un agent ménage" et "Catalogue ménage" sous le groupe Ménage', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')

    expect(screen.getByRole('button', { name: 'Ajouter un agent ménage' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Catalogue ménage' })).toBeInTheDocument()

    await openSubItem(user, 'Ajouter un agent ménage')
    expect(screen.getByRole('heading', { name: 'Nouvel agent de ménage' })).toBeInTheDocument()

    await openSubItem(user, 'Catalogue ménage')
    expect(await screen.findByText(/catalogue de produits de ménage/i)).toBeInTheDocument()
    expect(screen.getByText(/produits signalés en attente/i)).toBeInTheDocument()
  })

  it('affiche la section "Historique" sous le groupe Ménage', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')
    await openSubItem(user, 'Historique')

    expect(await screen.findByText(/historique des missions de ménage/i)).toBeInTheDocument()
  })

  it('affiche la section "Ménage à valider" sous le groupe Ménage', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')
    await openSubItem(user, 'Ménage à valider')

    expect(await screen.findByRole('heading', { name: /ménage à valider/i })).toBeInTheDocument()
    expect(await screen.findByText(/aucun ménage en attente de validation/i)).toBeInTheDocument()
  })

  it('affiche la liste des agents de ménage, puis modifie un agent via le crayon', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      agentsMenage: [
        { id: 7, nom: 'Fatima Zahra', role: 'menage', telephone: '0611111111', adresse: null, actif: true, appartements_habituel_count: 0, mission_menages_count: 0 },
      ],
      onUpdateUtilisateur: () => ({
        id: 7,
        nom: 'Fatima Zahra B.',
        role: 'menage',
        telephone: '0611111111',
        adresse: null,
        actif: true,
      }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')
    await openSubItem(user, 'Liste des agents')

    expect(await screen.findByText('Fatima Zahra')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /modifier l'agent fatima zahra/i }))

    expect(await screen.findByRole('heading', { name: "Modifier l'agent de ménage" })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('Fatima Zahra')
    expect(screen.queryByText(/appartements assignés/i)).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Nom'), 'Fatima Zahra B.')
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/utilisateurs/7'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    expect(await screen.findByText('Fatima Zahra B.')).toBeInTheDocument()
  })

  it('regroupe "Ajouter un agent maintenance" sous le groupe Maintenance', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      onCreateUtilisateur: () => ({ id: 7, nom: 'Karim Benali', role: 'maintenance', telephone: null }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Maintenance')
    await openSubItem(user, 'Ajouter un agent maintenance')

    expect(screen.getByRole('heading', { name: 'Nouvel agent de maintenance' })).toBeInTheDocument()
    expect(screen.queryByText(/appartements assignés/i)).not.toBeInTheDocument()

    const passwordInput = screen.getByLabelText(/mot de passe/i)
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.type(screen.getByLabelText('Nom'), 'Karim Benali')
    await user.type(passwordInput, 'motdepasse123')
    await user.click(screen.getByRole('button', { name: /créer le compte/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/utilisateurs'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"role":"maintenance"'),
        }),
      ),
    )
  })

  it('affiche la section "Maintenance à valider" sous le groupe Maintenance', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await openGroup(user, 'Maintenance')
    await openSubItem(user, 'Maintenance à valider')

    expect(await screen.findByRole('heading', { name: /tickets de maintenance/i })).toBeInTheDocument()
    expect(await screen.findByLabelText(/^statut$/i)).toHaveValue('resolu_en_attente_validation')
  })

  it('crée un agent de ménage avec mot de passe en clair', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [],
      onCreateUtilisateur: () => ({ id: 42, nom: 'Fatima Zahra', role: 'menage', telephone: null }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Ménage')
    await openSubItem(user, 'Ajouter un agent ménage')

    const passwordInput = screen.getByLabelText(/mot de passe/i)
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.type(screen.getByLabelText('Nom'), 'Fatima Zahra')
    await user.type(passwordInput, 'secret123')
    await user.click(screen.getByRole('button', { name: /créer le compte/i }))

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/utilisateurs'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('confirme le checkout depuis le détail d\'un séjour et affiche la mission de ménage', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [sejourFixture({ statut: 'en_cours' })],
      onCheckout: () => ({
        sejour: sejourFixture({ statut: 'termine' }),
        mission_menage: {
          id: 1,
          sejour_id: 1,
          agent_id: 5,
          statut: 'a_faire',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 80,
          vue: false,
          produits: [],
        },
      }),
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    const viewButton = await screen.findByRole('button', { name: /voir le détail du séjour de jean dupont/i })
    await user.click(viewButton)

    const checkoutButton = await screen.findByRole('button', { name: /confirmer le checkout/i })
    await user.click(checkoutButton)

    const missionBlock = await screen.findByText(/mission de ménage créée/i)
    expect(within(missionBlock.parentElement!).getByText('Fatima Z.')).toBeInTheDocument()

    // The "Nouveau" badge is informational for the Manager here -- only the
    // cleaning agent opening the mission in their own workspace dismisses
    // it (see MissionDetailAgent), so it stays visible on this screen.
    expect(screen.getByTestId('mission-nouvelle-badge')).toBeInTheDocument()
  })

  it('affiche la référence du séjour dans la liste et dans le détail', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({
      sejours: [sejourFixture({ reference: 'SEJ-0042' })],
    }) as typeof fetch

    renderApp()
    await openGroup(user, 'Séjours')

    expect(await screen.findByTestId('sejour-reference-1')).toHaveTextContent('SEJ-0042')

    const viewButton = await screen.findByRole('button', { name: /voir le détail du séjour de jean dupont/i })
    await user.click(viewButton)

    expect(await screen.findByTestId('sejour-reference')).toHaveTextContent('SEJ-0042')
  })

  it('le champ de recherche global de l\'en-tête est cliquable et accepte du texte saisi', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    await screen.findByTestId('dashboard-revenus-totaux')

    const search = screen.getByLabelText(/rechercher un séjour, un appartement/i)
    await user.click(search)
    await user.type(search, 'Loft Bastille')

    expect(search).toHaveValue('Loft Bastille')
  })

  it('le bouton Déconnexion appelle /api/logout et efface la session locale', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [] }) as typeof fetch

    renderApp()
    expect(await screen.findByTestId('dashboard-revenus-totaux')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Déconnexion' })[0])

    await waitFor(() => expect(localStorage.getItem('auth_token')).toBeNull())
    expect(localStorage.getItem('auth_user')).toBeNull()
  })
})
