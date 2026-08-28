import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketsMaintenanceSection } from './TicketsMaintenanceSection'
import type { Agent, TicketMaintenance } from '../types'

function ticketFixture(overrides: Partial<TicketMaintenance> = {}): TicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    appartement_id: 1,
    mission_origine_id: 1,
    agent_id: null,
    date_limite_intervention: null,
    est_en_retard: false,
    description: 'Le robinet fuit.',
    description_manager: null,
    description_manager_audio_url: null,
    photo_url: null,
    photo_transferee: false,
    audio_url: null,
    photo_apres: null,
    cout_reparation: null,
    note_resolution: null,
    audio_resolution_url: null,
    urgence: 'normale',
    statut: 'ouvert',
    created_at: '2026-08-10T09:00:00Z',
    refus: [],
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
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
      const result = statut ? currentTickets.filter((t) => t.statut === statut) : currentTickets
      return new Response(JSON.stringify(result), { status: 200 })
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
              date_limite_intervention: (body.get('date_limite_intervention') as string | null) ?? null,
            }
          : t,
      )
      return new Response(JSON.stringify(currentTickets.find((t) => t.id === id)), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

async function expandTicket(user: ReturnType<typeof userEvent.setup>, description: string) {
  await user.click(await screen.findByText(description))
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

  it('affiche les tickets avec référence, appartement et aperçu tronqué du problème', async () => {
    globalThis.fetch = mockFetch([ticketFixture()], []) as typeof fetch

    render(<TicketsMaintenanceSection />)

    expect(await screen.findByText('Le robinet fuit.')).toBeInTheDocument()
    const card = screen.getByRole('listitem')
    expect(within(card).getByText('Loft Bastille')).toBeInTheDocument()
    expect(within(card).getByText('MNT-0001')).toBeInTheDocument()
    expect(within(card).getByText(/signalé par fatima z\./i)).toBeInTheDocument()
  })

  it('replie la carte par défaut et ne montre le contenu complet qu\'après un clic', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      [ticketFixture({ photo_url: 'tickets-maintenance/photo.jpg' })],
      [agentFixture()],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    await screen.findByText('Le robinet fuit.')
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
    expect(screen.queryByAltText(/photo du problème signalé/i)).not.toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByLabelText(/^agent de maintenance$/i)).toBeInTheDocument()
    expect(screen.getByAltText(/photo du problème signalé/i)).toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
  })

  it('affiche la photo et le lecteur audio du signalement quand présents, une fois dépliée', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      [ticketFixture({ photo_url: 'tickets-maintenance/photo.jpg', audio_url: 'tickets-maintenance/audio.webm' })],
      [],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    await expandTicket(user, 'Le robinet fuit.')
    expect(screen.getByAltText(/photo du problème signalé/i)).toBeInTheDocument()
    expect(document.querySelector('audio')).toBeInTheDocument()
  })

  it('affiche un message quand aucun ticket n\'est présent', async () => {
    globalThis.fetch = mockFetch([], []) as typeof fetch

    render(<TicketsMaintenanceSection />)

    expect(await screen.findByText(/aucun ticket de maintenance\./i)).toBeInTheDocument()
  })

  it('le bouton Assigner est désactivé tant qu\'aucun agent ni description n\'est renseigné', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture()], [agentFixture()]) as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByRole('button', { name: /assigner/i })).toBeDisabled()
  })

  it('reste désactivé quand un agent est choisi mais aucune description écrite ni audio', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture()], [agentFixture()]) as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), '5')

    expect(screen.getByRole('button', { name: /assigner/i })).toBeDisabled()
  })

  it('s\'active dès qu\'une description écrite est renseignée', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture()], [agentFixture()]) as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), '5')
    await user.type(screen.getByLabelText(/instruction écrite pour l'agent/i), 'Changer le joint.')

    expect(screen.getByRole('button', { name: /assigner/i })).toBeEnabled()
  })

  it('assigne un ticket avec une description écrite, qui disparaît ensuite de la liste', async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    const fetchMock = mockFetch([ticketFixture()], [agent])
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketsMaintenanceSection />)
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
    await waitFor(() => expect(screen.queryByText('Le robinet fuit.')).not.toBeInTheDocument())
    expect(screen.getByText(/aucun ticket de maintenance\./i)).toBeInTheDocument()
  })

  it("envoie la date limite d'intervention quand elle est renseignée", async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    const fetchMock = mockFetch([ticketFixture()], [agent])
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), String(agent.id))
    await user.type(screen.getByLabelText(/instruction écrite pour l'agent/i), 'Changer le joint.')
    await user.type(screen.getByLabelText(/date limite d'intervention/i), '2026-09-01')
    await user.click(screen.getByRole('button', { name: /assigner/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/assigner'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('date_limite_intervention')).toBe('2026-09-01')
    })
  })

  it('affiche un badge "En retard" à la place du badge d\'urgence sur la carte', async () => {
    globalThis.fetch = mockFetch(
      [ticketFixture({ date_limite_intervention: '2026-08-01', est_en_retard: true })],
      [],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    expect(await screen.findByText('En retard')).toBeInTheDocument()
    expect(screen.queryByText('Urgence Normale')).not.toBeInTheDocument()
  })

  it('bascule vers l\'onglet audio, enregistre un message et l\'envoie sans texte', async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    const fetchMock = mockFetch([ticketFixture()], [agent])
    globalThis.fetch = fetchMock as typeof fetch

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

    render(<TicketsMaintenanceSection />)

    await expandTicket(user, 'Le robinet fuit.')
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), String(agent.id))
    await user.click(screen.getByRole('tab', { name: /enregistrer un audio/i }))
    await user.click(screen.getByRole('button', { name: /démarrer l'enregistrement/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }))
    await user.click(await screen.findByTestId('recording-indicator-1'))

    expect(screen.getByRole('button', { name: /assigner/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /assigner/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/assigner'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('description_manager_audio')).not.toBeNull()
      expect(body.get('description_manager')).toBeNull()
    })
  })

  it('n\'affiche la case "Transférer la photo" que si le signalement a une photo', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([ticketFixture({ photo_url: null })], [agentFixture()]) as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')
    expect(screen.queryByText(/transférer la photo/i)).not.toBeInTheDocument()
  })

  it('envoie photo_transferee=1 quand la case est cochée', async () => {
    const user = userEvent.setup()
    const agent = agentFixture()
    const fetchMock = mockFetch([ticketFixture({ photo_url: 'tickets-maintenance/photo.jpg' })], [agent])
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketsMaintenanceSection />)
    await expandTicket(user, 'Le robinet fuit.')
    const checkbox = screen.getByRole('checkbox', { name: /transférer la photo/i })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    await user.selectOptions(screen.getByLabelText(/^agent de maintenance$/i), String(agent.id))
    await user.type(screen.getByLabelText(/instruction écrite pour l'agent/i), 'Voir photo jointe.')
    await user.click(screen.getByRole('button', { name: /assigner/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/assigner'))
      expect(call).toBeDefined()
      const body = call![1]!.body as FormData
      expect(body.get('photo_transferee')).toBe('1')
    })
  })

  it('affiche un ticket à refaire avec le badge et l\'historique des refus, sans formulaire d\'assignation', async () => {
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
          created_at: '2026-08-11T10:00:00Z',
          manager: { id: 9, nom: 'Sophie M.' },
        },
      ],
    })
    globalThis.fetch = mockFetch([ticket], []) as typeof fetch

    render(<TicketsMaintenanceSection />)

    expect(await screen.findByText(/renvoyé par le manager/i)).toBeInTheDocument()

    await expandTicket(user, 'Le robinet fuit.')

    expect(screen.getByText('Karim B.')).toBeInTheDocument()
    expect(screen.getByText('La fuite persiste.')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^agent de maintenance$/i)).not.toBeInTheDocument()
  })

  it('filtre les tickets par urgence', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      [
        ticketFixture({ id: 1, urgence: 'haute', description: 'Fuite grave' }),
        ticketFixture({ id: 2, urgence: 'basse', description: 'Ampoule à changer' }),
      ],
      [],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    await screen.findByText('Fuite grave')
    expect(screen.getByText('Ampoule à changer')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^urgence$/i), 'haute')

    expect(screen.getByText('Fuite grave')).toBeInTheDocument()
    expect(screen.queryByText('Ampoule à changer')).not.toBeInTheDocument()
  })

  it('filtre les tickets par appartement', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      [
        ticketFixture({ id: 1, description: 'Fuite grave' }),
        ticketFixture({
          id: 2,
          description: 'Ampoule à changer',
          appartement_id: 2,
          appartement: { id: 2, nom: 'Zenith', adresse: 'B', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
        }),
      ],
      [],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    await screen.findByText('Fuite grave')
    await user.selectOptions(screen.getByLabelText(/^appartement$/i), '2')

    expect(screen.queryByText('Fuite grave')).not.toBeInTheDocument()
    expect(screen.getByText('Ampoule à changer')).toBeInTheDocument()
  })

  it('trie les tickets par date, plus récent en premier par défaut', async () => {
    globalThis.fetch = mockFetch(
      [
        ticketFixture({ id: 1, description: 'Ancien ticket', created_at: '2026-01-01T09:00:00Z' }),
        ticketFixture({ id: 2, description: 'Nouveau ticket', created_at: '2026-08-01T09:00:00Z' }),
      ],
      [],
    ) as typeof fetch

    render(<TicketsMaintenanceSection />)

    await screen.findByText('Ancien ticket')
    const descriptions = screen.getAllByText(/ticket$/).map((el) => el.textContent)
    expect(descriptions).toEqual(['Nouveau ticket', 'Ancien ticket'])
  })
})
