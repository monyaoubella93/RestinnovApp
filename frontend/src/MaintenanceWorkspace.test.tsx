import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './auth/AuthContext'
import i18n from './i18n'
import { MaintenanceWorkspace } from './MaintenanceWorkspace'
import type { MonTicketMaintenance } from './types'

function seedLoggedInAgent() {
  localStorage.setItem('auth_token', 'fake-token')
  localStorage.setItem('auth_user', JSON.stringify({ id: 9, nom: 'Karim B.', role: 'maintenance' }))
}

function ticketFixture(overrides: Partial<MonTicketMaintenance> = {}): MonTicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    statut: 'assigne',
    urgence: 'normale',
    description_manager: 'Changer le joint.',
    description_manager_audio_url: null,
    photo_url: null,
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    refus: [],
    ...overrides,
  }
}

function mockFetch(tickets: MonTicketMaintenance[] = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tickets-maintenance/mes-tickets') {
      return new Response(JSON.stringify(tickets), { status: 200 })
    }
    if (url.pathname === '/api/tickets-maintenance/mes-tickets/historique') {
      return new Response(JSON.stringify([]), { status: 200 })
    }
    if (url.pathname === '/api/logout' && method === 'POST') {
      return new Response(JSON.stringify({ message: 'Déconnecté.' }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <MaintenanceWorkspace />
    </AuthProvider>,
  )
}

describe('MaintenanceWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    seedLoggedInAgent()
    globalThis.fetch = mockFetch() as typeof fetch
  })

  afterEach(() => {
    void i18n.changeLanguage('fr')
  })

  it("affiche le titre Maintenance et le nom de l'agent connecté", async () => {
    renderWithAuth()

    expect(await screen.findByText('Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Karim B.')).toBeInTheDocument()
  })

  it('affiche un simple bouton icône + texte pour se déconnecter (pas un gros bouton pictogramme)', async () => {
    renderWithAuth()

    const bouton = await screen.findByRole('button', { name: 'Déconnexion' })
    expect(bouton).toBeInTheDocument()
    expect(bouton.textContent).toContain('Déconnexion')
  })

  it('affiche la section Mes tickets', async () => {
    renderWithAuth()

    expect(await screen.findByRole('heading', { name: 'Mes tickets' })).toBeInTheDocument()
  })

  it('le bouton Déconnexion appelle logout', async () => {
    const user = userEvent.setup()
    renderWithAuth()

    await screen.findByRole('heading', { name: 'Mes tickets' })
    await user.click(screen.getByRole('button', { name: 'Déconnexion' }))

    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('affiche les quatre onglets avec leurs compteurs', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({ id: 1, statut: 'assigne' }),
      ticketFixture({ id: 2, statut: 'resolu_en_attente_validation' }),
      ticketFixture({ id: 3, statut: 'a_refaire' }),
    ]) as typeof fetch
    renderWithAuth()

    await screen.findByRole('heading', { name: 'Mes tickets' })

    expect(screen.getByRole('tab', { name: /mes tickets.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /en attente.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /refusés.*1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /validés/i })).toBeInTheDocument()
  })

  it('bascule vers "Validés" au clic sur l\'onglet', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch
    renderWithAuth()

    await screen.findByRole('heading', { name: 'Mes tickets' })
    await user.click(screen.getByRole('tab', { name: /validés/i }))

    expect(await screen.findByRole('heading', { name: 'Validés' })).toBeInTheDocument()
  })

  it('affiche un point orange sur l\'onglet "Refusés" quand un refus n\'a pas été vu', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({
        statut: 'a_refaire',
        refus: [{ motif: 'Motif.', motif_audio_url: null, motif_photo_url: null, vu: false, date: '2026-08-11T10:00:00Z' }],
      }),
    ]) as typeof fetch
    renderWithAuth()

    await screen.findByRole('heading', { name: 'Mes tickets' })
    expect(await screen.findByTestId('refuses-dot')).toBeInTheDocument()
  })

  it('bascule en arabe au clic sur le sélecteur de langue : textes traduits et dir="rtl"', async () => {
    const user = userEvent.setup()
    const { container } = renderWithAuth()

    await screen.findByRole('heading', { name: 'Mes tickets' })
    expect(container.firstElementChild).toHaveAttribute('dir', 'ltr')

    await user.click(screen.getByRole('button', { name: /changer la langue/i }))

    expect(await screen.findByRole('heading', { name: 'الصيانة' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /تذاكري/ })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl')
    expect(localStorage.getItem('app_language')).toBe('ar')
  })
})
