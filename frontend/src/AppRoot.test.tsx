import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppRoot } from './AppRoot'
import { AuthProvider } from './auth/AuthContext'

function seedSession(user: { id: number; nom: string; role: 'manager' | 'menage' | 'maintenance' }) {
  localStorage.setItem('auth_token', 'fake-token')
  localStorage.setItem('auth_user', JSON.stringify(user))
}

/** Covers every GET/POST the Manager app and the Agent workspace load on mount. */
function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname
    const method = init?.method ?? 'GET'

    const empty = () => new Response(JSON.stringify([]), { status: 200 })

    if (path === '/api/appartements') return empty()
    if (path === '/api/proprietaires') return empty()
    if (path === '/api/checklist-modeles') return empty()
    if (path === '/api/utilisateurs') return empty()
    if (path === '/api/produits-catalogue') return empty()
    if (path === '/api/produits-signales') return empty()
    if (path === '/api/mission-menages') return empty()
    if (path === '/api/tickets-maintenance/mes-tickets') return empty()
    if (path === '/api/dashboard') {
      return new Response(
        JSON.stringify({
          revenus_totaux: 0,
          frais_menage_totaux: 0,
          frais_maintenance_totaux: 0,
          resultat_net: 0,
          appartements: [],
          sejours_par_statut: { a_venir: 0, en_cours: 0, termine: 0 },
          sejours_recents: [],
          departs_aujourdhui: [],
          problemes_signales: [],
          menages_a_valider: [],
          resolutions_a_valider: [],
        }),
        { status: 200 },
      )
    }
    if (path === '/api/login' && method === 'POST') {
      return new Response(
        JSON.stringify({ token: 'new-token', id: 1, nom: 'Fatima Z.', role: 'menage' }),
        { status: 200 },
      )
    }
    if (path === '/api/logout' && method === 'POST') {
      return new Response(JSON.stringify({ message: 'Déconnecté.' }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${path}`)
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AppRoot routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    globalThis.fetch = mockFetch() as typeof fetch
  })

  it("affiche l'écran de connexion sur '/' quand personne n'est connecté", async () => {
    renderAt('/')

    expect(await screen.findByAltText('RestInnov')).toBeInTheDocument()
    expect(screen.getByLabelText(/téléphone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it("affiche l'écran de connexion sur '/menage' aussi, quand personne n'est connecté", async () => {
    renderAt('/menage')

    expect(await screen.findByLabelText(/téléphone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('un compte manager accède à "/" et voit la sidebar Manager complète', async () => {
    seedSession({ id: 1, nom: 'Nadia M.', role: 'manager' })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 2 })).toBeInTheDocument()
    for (const label of ['Séjours', 'Appartements', 'Ménage', 'Maintenance']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('un compte menage accède à "/menage" et ne voit aucun élément du menu Manager', async () => {
    seedSession({ id: 5, nom: 'Fatima Z.', role: 'menage' })
    renderAt('/menage')

    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()

    for (const label of ['Dashboard', 'Séjours', 'Appartements', 'Maintenance']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Catalogue ménage')).not.toBeInTheDocument()
    expect(screen.queryByText('Ajouter un agent ménage')).not.toBeInTheDocument()
  })

  it('un compte menage qui accède à "/" est redirigé vers "/menage"', async () => {
    seedSession({ id: 5, nom: 'Fatima Z.', role: 'menage' })
    renderAt('/')

    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard', level: 2 })).not.toBeInTheDocument()
  })

  it('un compte manager qui accède à "/menage" est redirigé vers "/"', async () => {
    seedSession({ id: 1, nom: 'Nadia M.', role: 'manager' })
    renderAt('/menage')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Mes missions du jour')).not.toBeInTheDocument()
  })

  it("affiche l'écran de connexion sur '/maintenance' aussi, quand personne n'est connecté", async () => {
    renderAt('/maintenance')

    expect(await screen.findByLabelText(/téléphone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('un compte maintenance accède à "/maintenance" et voit ses tickets', async () => {
    seedSession({ id: 9, nom: 'Karim B.', role: 'maintenance' })
    renderAt('/maintenance')

    expect(await screen.findByRole('heading', { name: 'Mes tickets' })).toBeInTheDocument()
  })

  it('un compte maintenance qui accède à "/" est redirigé vers "/maintenance"', async () => {
    seedSession({ id: 9, nom: 'Karim B.', role: 'maintenance' })
    renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Mes tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard', level: 2 })).not.toBeInTheDocument()
  })

  it('un compte maintenance qui accède à "/menage" est redirigé vers "/maintenance"', async () => {
    seedSession({ id: 9, nom: 'Karim B.', role: 'maintenance' })
    renderAt('/menage')

    expect(await screen.findByRole('heading', { name: 'Mes tickets' })).toBeInTheDocument()
    expect(screen.queryByText('Mes missions du jour')).not.toBeInTheDocument()
  })

  it('un compte menage qui accède à "/maintenance" est redirigé vers "/menage"', async () => {
    seedSession({ id: 5, nom: 'Fatima Z.', role: 'menage' })
    renderAt('/maintenance')

    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mes tickets' })).not.toBeInTheDocument()
  })

  it('un compte manager qui accède à "/maintenance" est redirigé vers "/"', async () => {
    seedSession({ id: 1, nom: 'Nadia M.', role: 'manager' })
    renderAt('/maintenance')

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mes tickets' })).not.toBeInTheDocument()
  })

  it('le bouton Déconnexion sur /maintenance ramène à l\'écran de connexion', async () => {
    const user = userEvent.setup()
    seedSession({ id: 9, nom: 'Karim B.', role: 'maintenance' })
    renderAt('/maintenance')

    await screen.findByRole('heading', { name: 'Mes tickets' })
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }))

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('le bouton Déconnexion sur /menage ramène à l\'écran de connexion', async () => {
    const user = userEvent.setup()
    seedSession({ id: 5, nom: 'Fatima Z.', role: 'menage' })
    renderAt('/menage')

    await screen.findByText('Mes missions du jour')
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }))

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('une connexion réussie sur l\'écran de login affiche directement l\'espace correspondant au rôle', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.type(screen.getByLabelText(/téléphone/i), '0611111111')
    await user.type(screen.getByLabelText(/mot de passe/i), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    // The mocked /api/login always returns role "menage" here.
    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()
  })

  it('une réponse 401 sur un appel API ramène à l\'écran de connexion', async () => {
    seedSession({ id: 1, nom: 'Nadia M.', role: 'manager' })
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 })) as typeof fetch

    renderAt('/')

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
  })
})
