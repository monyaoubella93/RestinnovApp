import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoriqueTicketsSection } from './HistoriqueTicketsSection'
import type { TicketMaintenance } from '../types'

function ticketFixture(overrides: Partial<TicketMaintenance> = {}): TicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    appartement_id: 1,
    mission_origine_id: 1,
    agent_id: 5,
    date_limite_intervention: null,
    est_en_retard: false,
    description: 'Le robinet fuit.',
    description_manager: 'Changer le joint.',
    description_manager_audio_url: null,
    photo_url: null,
    photo_transferee: false,
    audio_url: null,
    photo_apres: 'tickets-maintenance/apres.jpg',
    cout_reparation: '45.50',
    note_resolution: null,
    audio_resolution_url: null,
    urgence: 'normale',
    statut: 'resolu',
    created_at: '2026-08-10T09:00:00Z',
    refus: [
      {
        id: 1,
        motif: 'La fuite persiste.',
        created_at: '2026-08-11T10:00:00Z',
        manager: { id: 9, nom: 'Sophie M.' },
      },
    ],
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
    agent: { id: 5, nom: 'Karim B.', role: 'maintenance', telephone: null },
    ...overrides,
  }
}

function mockFetch(tickets: TicketMaintenance[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/tickets-maintenance') {
      const statut = url.searchParams.get('statut')
      const result = statut ? tickets.filter((t) => t.statut === statut) : tickets
      return new Response(JSON.stringify(result), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('HistoriqueTicketsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche tous les tickets, tous statuts confondus, avec référence et statut', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({ id: 1, statut: 'resolu', description: 'Fuite réparée' }),
      ticketFixture({ id: 2, statut: 'ouvert', description: 'Nouveau problème', reference: 'MNT-0002' }),
    ]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    expect(await screen.findByText('Fuite réparée')).toBeInTheDocument()
    expect(screen.getByText('Nouveau problème')).toBeInTheDocument()
    expect(screen.getByText('MNT-0001')).toBeInTheDocument()
    expect(screen.getByText('MNT-0002')).toBeInTheDocument()

    const [resoluCard, ouvertCard] = screen.getAllByRole('listitem')
    expect(within(resoluCard).getByText('Résolu')).toBeInTheDocument()
    expect(within(ouvertCard).getByText('Ouvert')).toBeInTheDocument()
  })

  it('affiche l\'historique des refus, même après plusieurs refus successifs, une fois dépliée', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([
      ticketFixture({
        refus: [
          { id: 2, motif: 'Second refus.', created_at: '2026-08-12T10:00:00Z', manager: { id: 9, nom: 'Sophie M.' } },
          { id: 1, motif: 'Premier refus.', created_at: '2026-08-11T10:00:00Z', manager: { id: 9, nom: 'Sophie M.' } },
        ],
      }),
    ]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    await user.click(await screen.findByText('Le robinet fuit.'))

    expect(screen.getByText('Premier refus.')).toBeInTheDocument()
    expect(screen.getByText('Second refus.')).toBeInTheDocument()
  })

  it('filtre par statut', async () => {
    const fetchMock = mockFetch([ticketFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<HistoriqueTicketsSection />)

    await screen.findByText('Le robinet fuit.')
    await userEvent.setup().selectOptions(screen.getByLabelText(/^statut$/i), 'a_refaire')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('statut=a_refaire'))
      expect(call).toBeDefined()
    })
  })

  it('affiche un message quand il n\'y a aucun ticket', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    expect(await screen.findByText(/aucun ticket\./i)).toBeInTheDocument()
  })

  it('affiche le statut "En cours"', async () => {
    globalThis.fetch = mockFetch([ticketFixture({ statut: 'en_cours' })]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    expect(await screen.findByText('En cours')).toBeInTheDocument()
  })

  it("affiche la date limite d'intervention une fois dépliée", async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture({ date_limite_intervention: '2026-09-01' })]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    await user.click(await screen.findByText('Le robinet fuit.'))

    expect(screen.getByText(/01\/09\/2026/)).toBeInTheDocument()
  })

  it('affiche un badge "En retard" à la place du badge d\'urgence', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({ statut: 'assigne', date_limite_intervention: '2026-08-01', est_en_retard: true }),
    ]) as typeof fetch

    render(<HistoriqueTicketsSection />)

    expect(await screen.findByText('En retard')).toBeInTheDocument()
    expect(screen.queryByText('Urgence Normale')).not.toBeInTheDocument()
  })
})
