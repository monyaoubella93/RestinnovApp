import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentWorkspace } from './AgentWorkspace'
import { AuthProvider } from './auth/AuthContext'
import i18n from './i18n'
import type { MissionMenage } from './types'

function seedLoggedInAgent() {
  localStorage.setItem('auth_token', 'fake-token')
  localStorage.setItem('auth_user', JSON.stringify({ id: 1, nom: 'Fatima Z.', role: 'menage' }))
}

function missionFixture(overrides: Partial<MissionMenage> = {}): MissionMenage {
  return {
    id: 10,
    sejour_id: 1,
    agent_id: 1,
    statut: 'a_faire',
    agent: { id: 1, nom: 'Fatima Z.', role: 'menage', telephone: null },
    frais_forfait: 0,
    vue: true,
    produits: [],
    checklist_items: [],
    sejour: {
      id: 1,
      appartement: {
        id: 1,
        nom: 'Loft Bastille',
        adresse: '12 rue de la Roquette',
        statut: 'occupe',
        photo_principale: null,
        agent_habituel_id: null,
      },
    },
    ...overrides,
  }
}

function mockFetch(missions: MissionMenage[] = []) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/produits-catalogue') return new Response(JSON.stringify([]), { status: 200 })
    if (url.pathname === '/api/mission-menages') return new Response(JSON.stringify(missions), { status: 200 })
    if (url.pathname === '/api/mes-missions/historique') return new Response(JSON.stringify([]), { status: 200 })

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <AgentWorkspace />
    </AuthProvider>,
  )
}

describe('AgentWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    seedLoggedInAgent()
  })

  afterEach(() => {
    // i18next is a module-level singleton -- reset it so a language switch
    // in one test never leaks into the next.
    void i18n.changeLanguage('fr')
  })

  it('affiche "Mes missions du jour" par défaut', async () => {
    globalThis.fetch = mockFetch() as typeof fetch
    renderWithAuth()

    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()
  })

  it('affiche les quatre onglets avec leurs compteurs', async () => {
    globalThis.fetch = mockFetch([
      missionFixture({ id: 1, statut: 'a_faire' }),
      missionFixture({ id: 2, statut: 'en_attente_validation' }),
      missionFixture({ id: 3, statut: 'non_conforme' }),
    ]) as typeof fetch
    renderWithAuth()

    await screen.findByText('Mes missions du jour')

    expect(screen.getByRole('tab', { name: /mes missions.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /en attente.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /refusées.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /validées/i })).toBeInTheDocument()
  })

  it('bascule vers "Validées" au clic sur l\'onglet', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch
    renderWithAuth()

    await screen.findByText('Mes missions du jour')
    await user.click(screen.getByRole('tab', { name: /validées/i }))

    expect(await screen.findByRole('heading', { name: 'Validées' })).toBeInTheDocument()
    expect(screen.queryByText('Mes missions du jour')).not.toBeInTheDocument()
  })

  it('bascule vers "En attente" puis revient à "Mes missions"', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([missionFixture({ statut: 'en_attente_validation' })]) as typeof fetch
    renderWithAuth()

    await screen.findByText('Mes missions du jour')
    await user.click(screen.getByRole('tab', { name: /^en attente/i }))
    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /mes missions/i }))
    expect(await screen.findByText('Mes missions du jour')).toBeInTheDocument()
  })

  it('affiche un point orange sur l\'onglet "Refusées" quand un refus n\'a pas été vu', async () => {
    globalThis.fetch = mockFetch([
      missionFixture({
        statut: 'non_conforme',
        refus: [{ id: 1, motif: 'Motif.', motif_audio_url: null, motif_photo_url: null, vu: false, created_at: '2026-08-11T10:00:00Z' }],
      }),
    ]) as typeof fetch
    renderWithAuth()

    await screen.findByText('Mes missions du jour')
    expect(await screen.findByTestId('refusees-dot')).toBeInTheDocument()
  })

  it('n\'affiche pas de point orange quand tous les refus ont été vus', async () => {
    globalThis.fetch = mockFetch([
      missionFixture({
        statut: 'non_conforme',
        refus: [{ id: 1, motif: 'Motif.', motif_audio_url: null, motif_photo_url: null, vu: true, created_at: '2026-08-11T10:00:00Z' }],
      }),
    ]) as typeof fetch
    renderWithAuth()

    await screen.findByText('Mes missions du jour')
    expect(screen.queryByTestId('refusees-dot')).not.toBeInTheDocument()
  })

  it('bascule en arabe au clic sur le sélecteur de langue : textes traduits, dir="rtl", et le choix est mémorisé', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch
    const { container } = renderWithAuth()

    await screen.findByText('Mes missions du jour')
    expect(container.firstElementChild).toHaveAttribute('dir', 'ltr')

    await user.click(screen.getByRole('button', { name: /changer la langue/i }))

    expect(await screen.findByText('مهامي')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'النظافة' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl')
    expect(localStorage.getItem('app_language')).toBe('ar')
  })

  it('revient au français au clic suivant sur le sélecteur de langue', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch
    const { container } = renderWithAuth()

    await screen.findByText('Mes missions du jour')
    await user.click(screen.getByRole('button', { name: /changer la langue/i }))
    await screen.findByText('مهامي')

    await user.click(screen.getByRole('button', { name: /تغيير اللغة/i }))

    expect(await screen.findByText('Mes missions')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('dir', 'ltr')
    expect(localStorage.getItem('app_language')).toBe('fr')
  })
})
