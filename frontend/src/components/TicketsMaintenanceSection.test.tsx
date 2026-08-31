import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketsMaintenanceSection } from './TicketsMaintenanceSection'
import type { Agent, Appartement, TicketMaintenance } from '../types'

const APPARTEMENTS: Appartement[] = [
  { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
  { id: 2, nom: 'Zenith', adresse: 'B', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
]

function ticketFixture(overrides: Partial<TicketMaintenance> = {}): TicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    appartement_id: 1,
    mission_origine_id: 1,
    agent_id: null,
    description: 'Le robinet fuit.',
    description_manager: null,
    description_manager_audio_url: null,
    photo_url: null,
    photo_transferee: false,
    audio_url: null,
    photo_apres: null,
    cout_reparation: null,
    note_resolution: null,
    urgence: 'normale',
    statut: 'ouvert',
    created_at: '2026-08-10T09:00:00Z',
    refus: [],
    appartement: APPARTEMENTS[0],
    mission_origine: {
      id: 1,
      sejour_id: 1,
      agent_id: 2,
      statut: 'en_cours',
      agent: { id: 2, nom: 'Fatima Z.', role: 'menage', telephone: null },
      frais_forfait: 0,
      vue: true,
      sejour: {
        id: 1,
        reference: 'SEJ-0001',
        appartement_id: 1,
        date_arrivee: '2026-08-01',
        date_depart: '2026-08-05',
        nom_voyageur: 'Jean Dupont',
        statut: 'en_cours',
        plateforme_origine: 'airbnb',
        montant_mad: 1000,
      },
    },
    ...overrides,
  }
}

function agentFixture(overrides: Partial<Agent> = {}): Agent {
  return { id: 5, nom: 'Karim B.', role: 'maintenance', telephone: null, ...overrides }
}

function mockFetch(tickets: TicketMaintenance[], agents: Agent[]) {
  let currentTickets = [...tickets]

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tickets-maintenance' && method === 'GET') {
      const statut = url.searchParams.get('statut')
      const appartementId = url.searchParams.get('appartement_id')
      const dateDebut = url.searchParams.get('date_debut')
      const dateFin = url.searchParams.get('date_fin')
      const search = url.searchParams.get('search')

      let result = currentTickets
      if (statut) result = result.filter((t) => t.statut === statut)
      if (appartementId) result = result.filter((t) => String(t.appartement_id) === appartementId)
      if (dateDebut) {
        result = result.filter((t) => (t.mission_origine?.sejour?.date_arrivee ?? '') >= dateDebut)
      }
      if (dateFin) {
        result = result.filter((t) => (t.mission_origine?.sejour?.date_arrivee ?? '') <= dateFin)
      }
      if (search) {
        const needle = search.toLowerCase()
        result = result.filter(
          (t) => t.reference.toLowerCase().includes(needle) || (t.appartement?.nom.toLowerCase() ?? '').includes(needle),
        )
      }

      return new Response(JSON.stringify(result), { status: 200 })
    }

    if (url.pathname === '/api/tickets-maintenance/par-appartement' && method === 'GET') {
      const statut = url.searchParams.get('statut')
      const appartementId = url.searchParams.get('appartement_id')
      const dateDebut = url.searchParams.get('date_debut')
      const dateFin = url.searchParams.get('date_fin')
      const search = url.searchParams.get('search')

      let result = currentTickets
      if (statut) result = result.filter((t) => t.statut === statut)
      if (appartementId) result = result.filter((t) => String(t.appartement_id) === appartementId)
      if (dateDebut) {
        result = result.filter((t) => (t.mission_origine?.sejour?.date_arrivee ?? '') >= dateDebut)
      }
      if (dateFin) {
        result = result.filter((t) => (t.mission_origine?.sejour?.date_arrivee ?? '') <= dateFin)
      }
      if (search) {
        const needle = search.toLowerCase()
        result = result.filter(
          (t) => t.reference.toLowerCase().includes(needle) || (t.appartement?.nom.toLowerCase() ?? '').includes(needle),
        )
      }

      const parAppartement = new Map<number, TicketMaintenance[]>()
      for (const ticket of result) {
        const list = parAppartement.get(ticket.appartement_id) ?? []
        list.push(ticket)
        parAppartement.set(ticket.appartement_id, list)
      }

      const groupes = Array.from(parAppartement.entries())
        .map(([appartementId, ticketsAppartement]) => ({
          appartement: ticketsAppartement[0].appartement
            ? {
                id: ticketsAppartement[0].appartement.id,
                nom: ticketsAppartement[0].appartement.nom,
                adresse: ticketsAppartement[0].appartement.adresse,
              }
            : null,
          tickets_count: ticketsAppartement.length,
          cout_cumule: ticketsAppartement.reduce((total, t) => total + (Number(t.cout_reparation) || 0), 0),
          // Simplified for the test double: "récurrent" mirrors the backend's
          // >= 3-tickets threshold, over ALL of that appartement's tickets
          // (any statut, ignoring the currently applied filters) -- same
          // "independent of the active filter" semantics as the real endpoint.
          recurrent: currentTickets.filter((t) => t.appartement_id === appartementId).length >= 3,
          tickets: ticketsAppartement,
        }))
        .sort((a, b) => b.cout_cumule - a.cout_cumule)

      return new Response(JSON.stringify(groupes), { status: 200 })
    }

    if (url.pathname === '/api/utilisateurs' && method === 'GET') {
      return new Response(JSON.stringify(agents), { status: 200 })
    }

    const assignMatch = url.pathname.match(/^\/api\/tickets-maintenance\/(\d+)\/assigner$/)
    if (assignMatch && method === 'POST') {
      const id = Number(assignMatch[1])
      const body = init!.body as FormData
      const descriptionManager = (body.get('description_manager') as string | null) ?? null
      const hasAudio = body.get('description_manager_audio') !== null
      currentTickets = currentTickets.map((t) =>
        t.id === id
          ? {
              ...t,
              statut: 'assigne',
              agent_id: Number(body.get('agent_id')),
              description_manager: descriptionManager,
              description_manager_audio_url: hasAudio ? 'tickets-maintenance/manager-note.webm' : null,
              photo_transferee: body.get('photo_transferee') === '1',
            }
          : t,
      )
      return new Response(JSON.stringify(currentTickets.find((t) => t.id === id)), { status: 200 })
    }

    const validerMatch = url.pathname.match(/^\/api\/tickets-maintenance\/(\d+)\/valider-resolution$/)
    if (validerMatch && method === 'PATCH') {
      const id = Number(validerMatch[1])
      currentTickets = currentTickets.map((t) => (t.id === id ? { ...t, statut: 'resolu' } : t))
      return new Response(JSON.stringify(currentTickets.find((t) => t.id === id)), { status: 200 })
    }

    const refuserMatch = url.pathname.match(/^\/api\/tickets-maintenance\/(\d+)\/refuser-resolution$/)
    if (refuserMatch && method === 'POST') {
      const id = Number(refuserMatch[1])
      currentTickets = currentTickets.map((t) => (t.id === id ? { ...t, statut: 'a_refaire' } : t))
      return new Response(JSON.stringify(currentTickets.find((t) => t.id === id)), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

async function expandTicket(user: ReturnType<typeof userEvent.setup>, description: string) {
  await user.click(await screen.findByText(description))
}

function renderSection(
  tickets: TicketMaintenance[],
  agents: Agent[] = [],
  props: { initialStatutFilter?: TicketMaintenance['statut'] | ''; initialTicketId?: number | null } = {},
) {
  globalThis.fetch = mockFetch(tickets, agents) as typeof fetch
  return render(<TicketsMaintenanceSection appartements={APPARTEMENTS} {...props} />)
}

describe('TicketsMaintenanceSection', () => {
  const originalMediaRecorder = window.MediaRecorder
  const originalMediaDevices = navigator.mediaDevices

  beforeEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- deleting a possibly-undefined global for the test
    delete window.MediaRecorder
  })

  afterEach(() => {
    window.MediaRecorder = originalMediaRecorder
    Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true })
  })

  it('affiche les tickets avec référence, appartement, urgence et statut', async () => {
    renderSection([ticketFixture()])

    expect(await screen.findByText('Le robinet fuit.')).toBeInTheDocument()
    const card = screen.getByRole('listitem')
    expect(within(card).getByText('Loft Bastille')).toBeInTheDocument()
    expect(within(card).getByText('MNT-0001')).toBeInTheDocument()
    expect(within(card).getByText('Urgence Normale')).toBeInTheDocument()
    expect(within(card).getByText('Ouvert')).toBeInTheDocument()
  })

  it("charge tous les statuts par défaut (pas seulement ouvert/à refaire)", async () => {
    renderSection([
      ticketFixture({ id: 1, statut: 'ouvert', description: 'Ticket ouvert' }),
      ticketFixture({ id: 2, statut: 'assigne', description: 'Ticket assigné' }),
      ticketFixture({ id: 3, statut: 'resolu_en_attente_validation', description: 'Ticket en attente' }),
      ticketFixture({ id: 4, statut: 'a_refaire', description: 'Ticket à refaire' }),
      ticketFixture({ id: 5, statut: 'resolu', description: 'Ticket résolu' }),
    ])

    await screen.findByText('Ticket ouvert')
    expect(screen.getByText('Ticket assigné')).toBeInTheDocument()
    expect(screen.getByText('Ticket en attente')).toBeInTheDocument()
    expect(screen.getByText('Ticket à refaire')).toBeInTheDocument()
    expect(screen.getByText('Ticket résolu')).toBeInTheDocument()
  })

  it('replie la carte par défaut et ne montre le contenu complet qu\'après un clic', async () => {
    const user = userEvent.setup()
    renderSection([ticketFixture({ photo_url: 'tickets-maintenance/photo.jpg' })], [agentFixture()])

    await screen.findByText('Le robinet fuit.')
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
    expect(screen.queryByAltText(/photo du problème signalé/i)).not.toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByLabelText(/^agent de maintenance$/i)).toBeInTheDocument()
    expect(screen.getByAltText(/photo du problème signalé/i)).toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
  })

  it('affiche un message quand aucun ticket n\'est présent', async () => {
    renderSection([])

    expect(await screen.findByText(/aucun ticket de maintenance\./i)).toBeInTheDocument()
  })

  it('assigne un ticket ouvert avec une description écrite', async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    globalThis.fetch = mockFetch([ticketFixture()], [agent]) as typeof fetch
    render(<TicketsMaintenanceSection appartements={APPARTEMENTS} />)
    const fetchMock = globalThis.fetch as ReturnType<typeof mockFetch>

    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), String(agent.id))
    await user.type(screen.getByLabelText(/instruction écrite pour l'agent/i), 'Changer le joint.')
    await user.click(screen.getByRole('button', { name: /assigner/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/assigner'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('agent_id')).toBe(String(agent.id))
      expect(body.get('description_manager')).toBe('Changer le joint.')
    })
  })

  it('assigne un ticket ouvert avec un message audio enregistré', async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    globalThis.fetch = mockFetch([ticketFixture()], [agent]) as typeof fetch
    render(<TicketsMaintenanceSection appartements={APPARTEMENTS} />)
    const fetchMock = globalThis.fetch as ReturnType<typeof mockFetch>

    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    class FakeMediaRecorder {
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      mimeType = 'audio/webm'
      start() {
        this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
      }
      stop() {
        this.onstop?.()
      }
    }
    // @ts-expect-error -- assigning a minimal fake for the test
    window.MediaRecorder = FakeMediaRecorder

    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), String(agent.id))
    await user.click(screen.getByRole('tab', { name: /enregistrer un audio/i }))
    await user.click(screen.getByRole('button', { name: /démarrer l'enregistrement/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }))
    await user.click(await screen.findByTestId('recording-indicator-1'))
    await user.click(screen.getByRole('button', { name: /assigner/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/assigner'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('description_manager_audio')).not.toBeNull()
    })
  })

  it('affiche un ticket à refaire en lecture seule avec l\'historique des refus, sans formulaire d\'assignation', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'a_refaire',
      agent_id: 5,
      agent: agentFixture(),
      description_manager: 'Changer le joint.',
      refus: [
        {
          id: 1,
          motif: 'La fuite persiste.',
          motif_audio_url: null,
          motif_photo_url: null,
          vu: true,
          created_at: '2026-08-11T10:00:00Z',
          manager: { id: 9, nom: 'Sophie M.' },
        },
      ],
    })
    renderSection([ticket])

    expect(await screen.findByText('À refaire')).toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByText('Karim B.')).toBeInTheDocument()
    expect(screen.getByText('La fuite persiste.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^valider$/i })).not.toBeInTheDocument()
  })

  it('affiche les messages intermédiaires de l\'agent, par ordre chronologique', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'assigne',
      agent_id: 5,
      agent: agentFixture(),
      messages_agent: [
        { id: 1, photo_url: null, audio_url: null, note: 'Je dois commander une pièce.', created_at: '2026-08-11T09:00:00Z' },
        { id: 2, photo_url: 'tickets-maintenance/message-photo.jpg', audio_url: null, note: null, created_at: '2026-08-11T10:00:00Z' },
      ],
    })
    renderSection([ticket])

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByText("Messages de l'agent")).toBeInTheDocument()
    expect(screen.getByText('Je dois commander une pièce.')).toBeInTheDocument()
    expect(screen.getByAltText("Photo du message de l'agent")).toHaveAttribute(
      'src',
      expect.stringContaining('tickets-maintenance/message-photo.jpg'),
    )
  })

  it('affiche les photos supplémentaires du signalement en plus de la photo principale', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      photo_url: 'tickets-maintenance/photo.jpg',
      photos_signalement: [
        { id: 1, photo_url: 'tickets-maintenance/photo-2.jpg' },
        { id: 2, photo_url: 'tickets-maintenance/photo-3.jpg' },
      ],
    })
    renderSection([ticket])

    await expandTicket(user, 'Le robinet fuit.')

    const images = screen.getAllByAltText(/photo du problème signalé/i)
    expect(images).toHaveLength(3)
  })

  it('affiche les photos supplémentaires de la résolution en plus de la photo après réparation', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'resolu',
      agent_id: 5,
      agent: agentFixture(),
      photo_apres: 'tickets-maintenance/apres.jpg',
      photos_resolution: [{ id: 1, photo_url: 'tickets-maintenance/apres-2.jpg' }],
      cout_reparation: '45.50',
    })
    renderSection([ticket])

    await expandTicket(user, 'Le robinet fuit.')

    const images = screen.getAllByAltText(/photo après réparation/i)
    expect(images).toHaveLength(2)
  })

  it('affiche un ticket résolu en lecture seule avec la photo après réparation et le coût', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'resolu',
      agent_id: 5,
      agent: agentFixture(),
      photo_apres: 'tickets-maintenance/apres.jpg',
      cout_reparation: '45.50',
    })
    renderSection([ticket])

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByAltText(/photo après réparation/i)).toBeInTheDocument()
    expect(screen.getByText(/45\.50 MAD/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^valider$/i })).not.toBeInTheDocument()
  })

  it('valide une résolution en attente de validation', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'resolu_en_attente_validation',
      photo_apres: 'tickets-maintenance/apres.jpg',
      cout_reparation: '20',
    })
    globalThis.fetch = mockFetch([ticket], []) as typeof fetch
    render(<TicketsMaintenanceSection appartements={APPARTEMENTS} />)
    const fetchMock = globalThis.fetch as ReturnType<typeof mockFetch>

    await expandTicket(user, 'Le robinet fuit.')
    await user.click(screen.getByRole('button', { name: /^valider$/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/valider-resolution'))
      expect(call).toBeDefined()
    })
  })

  it('refuse une résolution en attente de validation avec un motif', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({ statut: 'resolu_en_attente_validation' })
    globalThis.fetch = mockFetch([ticket], []) as typeof fetch
    render(<TicketsMaintenanceSection appartements={APPARTEMENTS} />)
    const fetchMock = globalThis.fetch as ReturnType<typeof mockFetch>

    await expandTicket(user, 'Le robinet fuit.')
    await user.click(screen.getByRole('button', { name: /^refuser$/i }))
    await user.type(screen.getByLabelText(/motif du refus/i), 'La fuite persiste.')
    await user.click(screen.getByRole('button', { name: /confirmer le refus/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/refuser-resolution'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('motif')).toBe('La fuite persiste.')
    })
  })

  it('filtre les tickets par urgence', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, urgence: 'haute', description: 'Fuite grave' }),
      ticketFixture({ id: 2, urgence: 'basse', description: 'Ampoule à changer' }),
    ])

    await screen.findByText('Fuite grave')
    expect(screen.getByText('Ampoule à changer')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^urgence$/i), 'haute')

    expect(screen.getByText('Fuite grave')).toBeInTheDocument()
    expect(screen.queryByText('Ampoule à changer')).not.toBeInTheDocument()
  })

  it('filtre les tickets par statut', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, statut: 'ouvert', description: 'Ticket ouvert' }),
      ticketFixture({ id: 2, statut: 'resolu', description: 'Ticket résolu' }),
    ])

    await screen.findByText('Ticket ouvert')
    await user.selectOptions(screen.getByLabelText(/^statut$/i), 'resolu')

    await waitFor(() => expect(screen.queryByText('Ticket ouvert')).not.toBeInTheDocument())
    expect(screen.getByText('Ticket résolu')).toBeInTheDocument()
  })

  it('filtre les tickets par appartement (liste complète, pas seulement les tickets visibles)', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, description: 'Fuite grave' }),
      ticketFixture({ id: 2, description: 'Ampoule à changer', appartement_id: 2, appartement: APPARTEMENTS[1] }),
    ])

    await screen.findByText('Fuite grave')
    expect(screen.getByRole('option', { name: 'Zenith' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^appartement$/i), '2')

    await waitFor(() => expect(screen.queryByText('Fuite grave')).not.toBeInTheDocument())
    expect(screen.getByText('Ampoule à changer')).toBeInTheDocument()
  })

  it('filtre les tickets par plage de dates du séjour lié', async () => {
    const user = userEvent.setup()
    const ticketJanvier = ticketFixture({
      id: 1,
      description: 'Ticket janvier',
      mission_origine: {
        ...ticketFixture().mission_origine!,
        sejour: { ...ticketFixture().mission_origine!.sejour!, date_arrivee: '2026-01-10' },
      },
    })
    const ticketMars = ticketFixture({
      id: 2,
      description: 'Ticket mars',
      mission_origine: {
        ...ticketFixture().mission_origine!,
        sejour: { ...ticketFixture().mission_origine!.sejour!, date_arrivee: '2026-03-10' },
      },
    })
    renderSection([ticketJanvier, ticketMars])

    await screen.findByText('Ticket janvier')
    await user.type(screen.getByLabelText(/^du$/i), '2026-01-01')
    await user.type(screen.getByLabelText(/^au$/i), '2026-01-31')

    await waitFor(() => expect(screen.queryByText('Ticket mars')).not.toBeInTheDocument())
    expect(screen.getByText('Ticket janvier')).toBeInTheDocument()
  })

  it('recherche librement par référence ou nom d\'appartement', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, reference: 'MNT-0001', description: 'Fuite grave' }),
      ticketFixture({ id: 2, reference: 'MNT-0002', description: 'Ampoule', appartement_id: 2, appartement: APPARTEMENTS[1] }),
    ])

    await screen.findByText('Fuite grave')
    await user.type(screen.getByLabelText(/recherche/i), 'zenith')

    await waitFor(() => expect(screen.queryByText('Fuite grave')).not.toBeInTheDocument())
    expect(screen.getByText('Ampoule')).toBeInTheDocument()
  })

  it('applique un statut initial (ex. depuis le Dashboard) sans que l\'utilisateur ait à filtrer', async () => {
    renderSection(
      [
        ticketFixture({ id: 1, statut: 'ouvert', description: 'Ticket ouvert' }),
        ticketFixture({ id: 2, statut: 'resolu_en_attente_validation', description: 'Ticket en attente' }),
      ],
      [],
      { initialStatutFilter: 'resolu_en_attente_validation' },
    )

    await screen.findByText('Ticket en attente')
    expect(screen.queryByText('Ticket ouvert')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^statut$/i)).toHaveValue('resolu_en_attente_validation')
  })

  it('ouvre directement le détail complet du ticket ciblé (ex. depuis l\'historique de maintenance d\'un appartement)', async () => {
    renderSection(
      [
        ticketFixture({ id: 1, statut: 'resolu', description: 'Autre ticket', photo_apres: null }),
        ticketFixture({
          id: 2,
          statut: 'resolu',
          description: 'Chauffe-eau réparé',
          photo_apres: 'tickets-maintenance/apres.jpg',
          cout_reparation: '80.00',
        }),
      ],
      [],
      { initialTicketId: 2 },
    )

    await screen.findByText('Chauffe-eau réparé')

    // The targeted ticket's full detail (photo/coût) is already visible --
    // no extra click needed -- while the other ticket stays collapsed.
    expect(screen.getByAltText('Photo après réparation')).toBeInTheDocument()
    expect(screen.getByText('Coût : 80.00 MAD')).toBeInTheDocument()
  })

  // --- Vue "Groupé par appartement" ---

  it('bascule vers la vue groupée par appartement et affiche le nombre de tickets et le coût cumulé', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, statut: 'resolu', cout_reparation: '45.50' }),
      ticketFixture({ id: 2, statut: 'resolu', cout_reparation: '20' }),
    ])

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))

    expect(await screen.findByRole('button', { name: /loft bastille/i })).toBeInTheDocument()
    expect(screen.getByText('2 tickets')).toBeInTheDocument()
    expect(screen.getByTestId('cout-cumule-1')).toHaveTextContent('65.50 MAD')
  })

  it('affiche le badge "Récurrent" à partir de 3 tickets pour un appartement', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1 }),
      ticketFixture({ id: 2 }),
      ticketFixture({ id: 3 }),
    ])

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))

    expect(await screen.findByTestId('recurrent-badge-1')).toHaveTextContent('Récurrent')
  })

  it('n\'affiche pas le badge "Récurrent" en dessous du seuil', async () => {
    const user = userEvent.setup()
    renderSection([ticketFixture({ id: 1 }), ticketFixture({ id: 2 })])

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))

    await screen.findByRole('button', { name: /loft bastille/i })
    expect(screen.queryByTestId('recurrent-badge-1')).not.toBeInTheDocument()
  })

  it('déplie un groupe au clic pour afficher ses tickets avec leurs badges de statut colorés', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, statut: 'resolu', description: 'Ticket résolu' }),
      ticketFixture({ id: 2, statut: 'resolu_en_attente_validation', description: 'Ticket en attente' }),
      ticketFixture({ id: 3, statut: 'a_refaire', description: 'Ticket à refaire' }),
    ])

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))

    const groupHeader = await screen.findByRole('button', { name: /loft bastille/i })
    expect(screen.queryByText('Ticket résolu')).not.toBeInTheDocument()

    await user.click(groupHeader)

    const groupePanel = groupHeader.closest('li') as HTMLElement
    expect(within(groupePanel).getByText('Ticket résolu')).toBeInTheDocument()
    expect(within(groupePanel).getByText('Ticket en attente')).toBeInTheDocument()
    expect(within(groupePanel).getByText('Ticket à refaire')).toBeInTheDocument()
    expect(within(groupePanel).getByText('Résolu')).toBeInTheDocument()
    expect(within(groupePanel).getByText('Résolu — en attente de validation')).toBeInTheDocument()
    expect(within(groupePanel).getByText('À refaire')).toBeInTheDocument()
  })

  it('un groupe déplié reste pleinement interactif (ex. valider une résolution en attente)', async () => {
    const user = userEvent.setup()
    const ticket = ticketFixture({
      statut: 'resolu_en_attente_validation',
      photo_apres: 'tickets-maintenance/apres.jpg',
      cout_reparation: '20',
    })
    globalThis.fetch = mockFetch([ticket], []) as typeof fetch
    render(<TicketsMaintenanceSection appartements={APPARTEMENTS} />)
    const fetchMock = globalThis.fetch as ReturnType<typeof mockFetch>

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))
    await user.click(await screen.findByRole('button', { name: /loft bastille/i }))
    await expandTicket(user, 'Le robinet fuit.')
    await user.click(screen.getByRole('button', { name: /^valider$/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/valider-resolution'))
      expect(call).toBeDefined()
    })
  })

  it('regroupe des appartements distincts dans des groupes séparés, triés par coût cumulé décroissant', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, statut: 'resolu', cout_reparation: '10', description: 'Petit coût' }),
      ticketFixture({
        id: 2,
        statut: 'resolu',
        cout_reparation: '500',
        description: 'Gros coût',
        appartement_id: 2,
        appartement: APPARTEMENTS[1],
      }),
    ])

    await screen.findByText('Petit coût')
    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))

    const headers = await screen.findAllByRole('button', { expanded: false })
    const groupHeaders = headers.filter((el) => el.textContent?.includes('Bastille') || el.textContent?.includes('Zenith'))
    expect(groupHeaders[0].textContent).toContain('Zenith')
    expect(groupHeaders[1].textContent).toContain('Bastille')
  })

  it('les filtres statut/appartement/date/recherche s\'appliquent aussi à la vue groupée', async () => {
    const user = userEvent.setup()
    renderSection([
      ticketFixture({ id: 1, statut: 'ouvert' }),
      ticketFixture({ id: 2, statut: 'resolu' }),
    ])

    await user.click(screen.getByRole('tab', { name: /groupé par appartement/i }))
    await screen.findByRole('button', { name: /loft bastille/i })
    expect(screen.getByText('2 tickets')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^statut$/i), 'resolu')

    await waitFor(() => expect(screen.getByText('1 ticket')).toBeInTheDocument())
  })
})
