import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoriqueTicketsAgentSection } from './HistoriqueTicketsAgentSection'
import i18n from '../i18n'
import type { HistoriqueTicketAgent } from '../types'

function ticketFixture(overrides: Partial<HistoriqueTicketAgent> = {}): HistoriqueTicketAgent {
  return {
    id: 1,
    reference: 'MNT-0001',
    urgence: 'normale',
    description_manager: null,
    photo_apres: null,
    cout_reparation: null,
    note_resolution: null,
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    messages_agent: [],
    ...overrides,
  }
}

function mockFetch(tickets: HistoriqueTicketAgent[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/tickets-maintenance/mes-tickets/historique') {
      const appartementId = url.searchParams.get('appartement_id')
      const search = url.searchParams.get('search')
      const dateDebut = url.searchParams.get('date_debut')

      let result = tickets
      if (appartementId) result = result.filter((t) => String(t.appartement?.id) === appartementId)
      if (search) {
        const needle = search.toLowerCase()
        result = result.filter(
          (t) => t.reference.toLowerCase().includes(needle) || (t.appartement?.nom.toLowerCase() ?? '').includes(needle),
        )
      }
      // date_debut isn't actually derivable from this fixture shape (no
      // sejour date exposed) -- just prove the param reaches the request.
      if (dateDebut === '2099-01-01') result = []

      return new Response(JSON.stringify(result), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('HistoriqueTicketsAgentSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    void i18n.changeLanguage('fr')
  })

  it("le niveau d'urgence reste en français quand l'interface est en arabe", async () => {
    await i18n.changeLanguage('ar')
    globalThis.fetch = mockFetch([ticketFixture({ urgence: 'haute' })]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)

    expect(await screen.findByText('الأولوية Haute')).toBeInTheDocument()
  })

  it('affiche les tickets validés', async () => {
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)

    expect(await screen.findByRole('button', { name: /loft bastille/i })).toBeInTheDocument()
  })

  it('affiche un état vide quand l\'agent n\'a aucun ticket validé', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)

    expect(await screen.findByText(/aucun ticket validé pour l'instant/i)).toBeInTheDocument()
  })

  it('filtre par recherche texte (référence ou appartement)', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([
      ticketFixture({ id: 1, appartement: { id: 1, nom: 'Loft Bastille', adresse: 'A' } }),
      ticketFixture({ id: 2, reference: 'MNT-0002', appartement: { id: 2, nom: 'Studio Marais', adresse: 'B' } }),
    ]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)
    expect(await screen.findByRole('button', { name: /loft bastille/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/recherche/i), 'Marais')

    await waitFor(() => expect(screen.queryByRole('button', { name: /loft bastille/i })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /studio marais/i })).toBeInTheDocument()
  })

  it('propose un filtre par appartement peuplé à partir des tickets de l\'agent', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([
      ticketFixture({ id: 1, appartement: { id: 1, nom: 'Loft Bastille', adresse: 'A' } }),
      ticketFixture({ id: 2, reference: 'MNT-0002', appartement: { id: 2, nom: 'Studio Marais', adresse: 'B' } }),
    ]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)
    expect(await screen.findByRole('button', { name: /loft bastille/i })).toBeInTheDocument()

    const select = await screen.findByLabelText(/^appartement$/i)
    expect(await screen.findByRole('option', { name: 'Studio Marais' })).toBeInTheDocument()

    await user.selectOptions(select, '2')

    await waitFor(() => expect(screen.queryByRole('button', { name: /loft bastille/i })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /studio marais/i })).toBeInTheDocument()
  })

  it('filtre par plage de dates', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)
    expect(await screen.findByRole('button', { name: /loft bastille/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^du$/i), '2099-01-01')

    await waitFor(() => expect(screen.queryByRole('button', { name: /loft bastille/i })).not.toBeInTheDocument())
  })

  it('affiche les messages envoyés par l\'agent sur le ticket, une fois déplié', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([
      ticketFixture({
        messages_agent: [{ id: 1, photo_url: null, audio_url: null, note: 'Pièce commandée le 10.', created_at: '2026-08-10T09:00:00Z' }],
      }),
    ]) as typeof fetch

    render(<HistoriqueTicketsAgentSection />)
    const row = await screen.findByRole('button', { name: /loft bastille/i })
    await user.click(row)

    expect(await screen.findByText('Pièce commandée le 10.')).toBeInTheDocument()
  })
})
