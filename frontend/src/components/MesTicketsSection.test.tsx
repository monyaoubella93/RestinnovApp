import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MesTicketsSection } from './MesTicketsSection'
import type { MonTicketMaintenance } from '../types'

function ticketFixture(overrides: Partial<MonTicketMaintenance> = {}): MonTicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    statut: 'assigne',
    urgence: 'normale',
    date_limite_intervention: null,
    est_en_retard: false,
    description_manager: 'Changer le joint du robinet.',
    description_manager_audio_url: null,
    photo_url: null,
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    refus: [],
    ...overrides,
  }
}

function mockFetch(tickets: MonTicketMaintenance[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/tickets-maintenance/mes-tickets') {
      return new Response(JSON.stringify(tickets), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('MesTicketsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("affiche les tickets assignés avec appartement, urgence et description", async () => {
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<MesTicketsSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Changer le joint du robinet.')).toBeInTheDocument()
    expect(screen.getByText('Urgence Normale')).toBeInTheDocument()
  })

  it('affiche la référence du ticket et le badge "à refaire" avec son motif', async () => {
    const ticket = ticketFixture({
      statut: 'a_refaire',
      refus: [{ motif: 'La fuite persiste.', date: '2026-08-11T10:00:00Z' }],
    })
    globalThis.fetch = mockFetch([ticket]) as typeof fetch

    render(<MesTicketsSection />)

    expect(await screen.findByText('MNT-0001')).toBeInTheDocument()
    expect(screen.getByText(/renvoyé par le manager/i)).toBeInTheDocument()
  })

  it("affiche un message quand l'agent n'a aucun ticket", async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<MesTicketsSection />)

    expect(await screen.findByText(/aucun ticket pour l'instant/i)).toBeInTheDocument()
  })

  it('affiche la date limite sous le badge d\'urgence quand elle est renseignée', async () => {
    globalThis.fetch = mockFetch([ticketFixture({ date_limite_intervention: '2026-09-01' })]) as typeof fetch

    render(<MesTicketsSection />)

    expect(await screen.findByText(/à effectuer avant 01\/09\/2026/i)).toBeInTheDocument()
  })

  it('remplace le badge d\'urgence par un badge "En retard" quand le ticket est en retard', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({ date_limite_intervention: '2026-08-01', est_en_retard: true }),
    ]) as typeof fetch

    render(<MesTicketsSection />)

    expect(await screen.findByText('En retard')).toBeInTheDocument()
    expect(screen.queryByText('Urgence Normale')).not.toBeInTheDocument()
  })

  it('ouvre le détail du ticket au clic sur la carte', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture({ statut: 'en_cours' })]) as typeof fetch

    render(<MesTicketsSection />)

    await user.click(await screen.findByText('Loft Bastille'))

    expect(screen.getByText('Marquer comme résolu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retour à mes tickets/i })).toBeInTheDocument()
  })

  it('reste sur la confirmation de résolution même une fois le ticket disparu de la liste rafraîchie', async () => {
    const user = userEvent.setup()
    let current = [ticketFixture({ statut: 'en_cours' })]

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'

      if (url.pathname === '/api/tickets-maintenance/mes-tickets' && method === 'GET') {
        return new Response(JSON.stringify(current), { status: 200 })
      }
      if (url.pathname === '/api/tickets-maintenance/1/resoudre' && method === 'POST') {
        // Resolving removes it from the "assigne" list this screen fetches.
        current = []
        return new Response(
          JSON.stringify({ ...ticketFixture(), statut: 'resolu_en_attente_validation' }),
          { status: 200 },
        )
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`)
    }) as typeof fetch

    render(<MesTicketsSection />)

    await user.click(await screen.findByText('Loft Bastille'))
    const photo = new File(['x'], 'reparation.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo de la réparation/i), photo)
    await user.type(screen.getByLabelText(/prix de la réparation/i), '45')
    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    expect(await screen.findByTestId('resolution-confirmation')).toHaveTextContent(
      'Envoyé au Manager pour validation',
    )
    // Still on the confirmation screen -- not bounced back to an empty list.
    expect(screen.getByRole('button', { name: /retour à mes tickets/i })).toBeInTheDocument()
  })
})
