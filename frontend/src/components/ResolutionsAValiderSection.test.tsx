import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolutionsAValiderSection } from './ResolutionsAValiderSection'
import type { TicketMaintenance } from '../types'

function ticketFixture(overrides: Partial<TicketMaintenance> = {}): TicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    appartement_id: 1,
    mission_origine_id: 1,
    agent_id: 5,
    description: null,
    description_manager: 'Changer le joint du robinet.',
    description_manager_audio_url: null,
    photo_url: null,
    photo_transferee: false,
    audio_url: null,
    photo_apres: 'tickets-maintenance/apres.jpg',
    cout_reparation: '45.50',
    note_resolution: null,
    audio_resolution_url: null,
    urgence: 'normale',
    statut: 'resolu_en_attente_validation',
    created_at: '2026-08-10T09:00:00Z',
    refus: [],
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'maintenance', photo_principale: null, agent_habituel_id: null },
    ...overrides,
  }
}

function mockFetch(tickets: TicketMaintenance[]) {
  let current = [...tickets]

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tickets-maintenance' && method === 'GET') {
      const statut = url.searchParams.get('statut')
      return new Response(JSON.stringify(statut ? current.filter((t) => t.statut === statut) : current), {
        status: 200,
      })
    }

    const validerMatch = url.pathname.match(/^\/api\/tickets-maintenance\/(\d+)\/valider-resolution$/)
    if (validerMatch && method === 'PATCH') {
      const id = Number(validerMatch[1])
      current = current.map((t) => (t.id === id ? { ...t, statut: 'resolu' } : t))
      return new Response(JSON.stringify(current.find((t) => t.id === id)), { status: 200 })
    }

    const refuserMatch = url.pathname.match(/^\/api\/tickets-maintenance\/(\d+)\/refuser-resolution$/)
    if (refuserMatch && method === 'PATCH') {
      const id = Number(refuserMatch[1])
      current = current.map((t) => (t.id === id ? { ...t, statut: 'a_refaire' } : t))
      return new Response(JSON.stringify(current.find((t) => t.id === id)), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

describe('ResolutionsAValiderSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche les résolutions en attente avec photo après, coût et description', async () => {
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<ResolutionsAValiderSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('Changer le joint du robinet.')).toBeInTheDocument()
    expect(screen.getByAltText(/photo après réparation/i)).toBeInTheDocument()
    expect(screen.getByText(/45.50 MAD/)).toBeInTheDocument()
  })

  it('affiche le lecteur audio de la résolution quand un enregistrement a été fourni', async () => {
    globalThis.fetch = mockFetch([
      ticketFixture({ audio_resolution_url: 'tickets-maintenance/resolution-audio.webm' }),
    ]) as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    const audio = document.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('src', expect.stringContaining('tickets-maintenance/resolution-audio.webm'))
  })

  it('n\'affiche aucun lecteur audio quand la résolution n\'en a pas', async () => {
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    expect(document.querySelector('audio')).not.toBeInTheDocument()
  })

  it('affiche un message quand aucune résolution n\'est en attente', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<ResolutionsAValiderSection />)

    expect(await screen.findByText(/aucune résolution en attente de validation/i)).toBeInTheDocument()
  })

  it('valide une résolution, qui disparaît ensuite de la liste', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch([ticketFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /valider/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/tickets-maintenance/1/valider-resolution'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    await waitFor(() => expect(screen.queryByText('Loft Bastille')).not.toBeInTheDocument())
    expect(screen.getByText(/aucune résolution en attente de validation/i)).toBeInTheDocument()
  })

  it('ouvre une modal de refus avec un motif obligatoire, désactivant la confirmation tant qu\'il est vide', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture()]) as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /^refuser$/i }))

    const confirmButton = screen.getByRole('button', { name: /confirmer le refus/i })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText(/motif du refus/i), 'La fuite persiste.')
    expect(confirmButton).toBeEnabled()
  })

  it('refuse une résolution avec un motif, qui disparaît ensuite de la liste', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch([ticketFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /^refuser$/i }))
    await user.type(screen.getByLabelText(/motif du refus/i), 'La fuite persiste.')
    await user.click(screen.getByRole('button', { name: /confirmer le refus/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/refuser-resolution'))
      expect(call).toBeDefined()
      expect(call![1]).toMatchObject({ method: 'PATCH' })
      expect(JSON.parse(call![1]!.body as string)).toEqual({ motif: 'La fuite persiste.' })
    })
    await waitFor(() => expect(screen.queryByText('Loft Bastille')).not.toBeInTheDocument())
    expect(screen.getByText(/aucune résolution en attente de validation/i)).toBeInTheDocument()
  })

  it('permet d\'annuler le refus sans envoyer de requête', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch([ticketFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<ResolutionsAValiderSection />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /^refuser$/i }))
    await user.click(screen.getByRole('button', { name: /annuler/i }))

    expect(screen.queryByLabelText(/motif du refus/i)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/refuser-resolution'))).toBe(false)
  })
})
