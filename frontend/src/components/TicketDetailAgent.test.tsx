import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketDetailAgent } from './TicketDetailAgent'
import type { MonTicketMaintenance } from '../types'

const TICKET: MonTicketMaintenance = {
  id: 1,
  reference: 'MNT-0001',
  statut: 'assigne',
  urgence: 'haute',
  description_manager: 'Changer le joint du robinet.',
  description_manager_audio_url: null,
  photo_url: null,
  appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
  refus: [],
}

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tickets-maintenance/1/resoudre' && method === 'POST') {
      return new Response(JSON.stringify({ ...TICKET, statut: 'resolu_en_attente_validation' }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

describe('TicketDetailAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche les informations du ticket : appartement, urgence, description_manager', () => {
    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Changer le joint du robinet.')).toBeInTheDocument()
    expect(screen.getByText('Urgence Haute')).toBeInTheDocument()
    expect(screen.getByText('MNT-0001')).toBeInTheDocument()
  })

  it('affiche le motif du refus quand le ticket a été renvoyé pour être refait', () => {
    render(
      <TicketDetailAgent
        ticket={{
          ...TICKET,
          statut: 'a_refaire',
          refus: [{ motif: 'La fuite persiste.', date: '2026-08-11T10:00:00Z' }],
        }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    expect(screen.getByTestId('refus-banner')).toHaveTextContent('La fuite persiste.')
  })

  it('n\'affiche ni lecteur audio ni photo quand le Manager n\'en a fourni aucun', () => {
    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(document.querySelector('audio')).not.toBeInTheDocument()
    expect(screen.queryByAltText(/photo du problème signalé/i)).not.toBeInTheDocument()
  })

  it('affiche le message audio du Manager quand présent', () => {
    render(
      <TicketDetailAgent
        ticket={{ ...TICKET, description_manager_audio_url: 'tickets-maintenance/manager-note.webm' }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    const audio = document.querySelector('audio')
    expect(audio).toBeInTheDocument()
    expect(audio).toHaveAttribute('src', expect.stringContaining('tickets-maintenance/manager-note.webm'))
  })

  it('affiche la photo du signalement uniquement si le Manager l\'a transférée', () => {
    render(
      <TicketDetailAgent
        ticket={{ ...TICKET, photo_url: 'tickets-maintenance/photo.jpg' }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    expect(screen.getByAltText(/photo du problème signalé/i)).toBeInTheDocument()
  })

  it('refuse la résolution sans photo ni prix', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    expect(await screen.findByText(/prenez une photo/i)).toBeInTheDocument()
  })

  it('envoie la résolution avec photo + prix et affiche la confirmation, sans redirection automatique', async () => {
    const user = userEvent.setup()
    const onResolu = vi.fn()
    const fetchMock = mockFetch()
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={onResolu} />)

    const photo = new File(['x'], 'reparation.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo de la réparation/i), photo)
    await user.type(screen.getByLabelText(/prix de la réparation/i), '45')
    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await screen.findByTestId('resolution-confirmation')).toHaveTextContent(
      'Envoyé au Manager pour validation',
    )
    expect(onResolu).toHaveBeenCalledTimes(1)
    // Stays visible -- no redirect back to the list.
    expect(screen.getByRole('button', { name: /retour à mes tickets/i })).toBeInTheDocument()

    // No audio was recorded -- the request must not carry an audio_resolution part.
    const body = fetchMock.mock.calls[0][1]?.body as FormData
    expect(body.has('audio_resolution')).toBe(false)
  })

  function mockMicSupport() {
    const fakeTrack = { stop: vi.fn() }
    const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })

    class FakeMediaRecorder {
      static isTypeSupported = () => true
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      mimeType = 'audio/webm'
      stream: MediaStream
      constructor(stream: MediaStream) {
        this.stream = stream
      }
      start() {
        this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
      }
      stop() {
        this.onstop?.()
      }
    }
    // @ts-expect-error -- assigning a minimal fake for the test
    window.MediaRecorder = FakeMediaRecorder

    return { getUserMedia }
  }

  it('propose un enregistrement audio marqué optionnel sur l\'écran de résolution', () => {
    mockMicSupport()

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.getByText(/audio \(optionnel\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enregistrer un message audio \(optionnel\)/i })).toBeInTheDocument()

    delete (window as { MediaRecorder?: unknown }).MediaRecorder
  })

  it('enregistre un audio optionnel et l\'envoie avec la résolution', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    globalThis.fetch = fetchMock as typeof fetch

    const { getUserMedia } = mockMicSupport()

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /enregistrer un message audio \(optionnel\)/i }))
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }))
    await user.click(await screen.findByRole('button', { name: /arrêter l'enregistrement/i }))
    expect(await screen.findByRole('button', { name: /recommencer l'enregistrement/i })).toBeInTheDocument()

    const photo = new File(['x'], 'reparation.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo de la réparation/i), photo)
    await user.type(screen.getByLabelText(/prix de la réparation/i), '45')
    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = fetchMock.mock.calls[0][1]?.body as FormData
    expect(body.get('audio_resolution')).toBeInstanceOf(File)

    delete (window as { MediaRecorder?: unknown }).MediaRecorder
  })
})
