import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketDetailAgent } from './TicketDetailAgent'
import i18n from '../i18n'
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
  messages_agent: [],
}

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/tickets-maintenance/1/resoudre' && method === 'POST') {
      return new Response(JSON.stringify({ ...TICKET, statut: 'resolu_en_attente_validation' }), { status: 200 })
    }

    if (url.pathname === '/api/tickets-maintenance/1/message' && method === 'POST') {
      return new Response(
        JSON.stringify({ ...TICKET, messages_agent: [{ id: 1, photo_url: null, audio_url: null, note: 'Une précision.', created_at: '2026-08-20T10:00:00Z' }] }),
        { status: 200 },
      )
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

describe('TicketDetailAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    void i18n.changeLanguage('fr')
  })

  it('affiche les informations du ticket : appartement, urgence, description_manager', () => {
    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Changer le joint du robinet.')).toBeInTheDocument()
    expect(screen.getByText('Urgence Haute')).toBeInTheDocument()
    expect(screen.getByText('MNT-0001')).toBeInTheDocument()
  })

  it("le niveau d'urgence reste en français quand l'interface est en arabe", async () => {
    await i18n.changeLanguage('ar')

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.getByText('الأولوية Haute')).toBeInTheDocument()
  })

  it('affiche le motif du refus quand le ticket a été renvoyé pour être refait', () => {
    render(
      <TicketDetailAgent
        ticket={{
          ...TICKET,
          statut: 'a_refaire',
          refus: [
            { motif: 'La fuite persiste.', motif_audio_url: null, motif_photo_url: null, vu: true, date: '2026-08-11T10:00:00Z' },
          ],
        }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    expect(screen.getByTestId('refus-banner')).toHaveTextContent('La fuite persiste.')
  })

  it('affiche un lecteur audio et une photo pour le motif de refus quand présents', () => {
    render(
      <TicketDetailAgent
        ticket={{
          ...TICKET,
          statut: 'a_refaire',
          refus: [
            {
              motif: null,
              motif_audio_url: 'tickets-maintenance/refus-audio.webm',
              motif_photo_url: 'tickets-maintenance/refus-photo.jpg',
              vu: true,
              date: '2026-08-11T10:00:00Z',
            },
          ],
        }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    const banner = screen.getByTestId('refus-banner')
    expect(banner.querySelector('audio')).toHaveAttribute('src', expect.stringContaining('tickets-maintenance/refus-audio.webm'))
    expect(banner.querySelector('img')).toHaveAttribute('src', expect.stringContaining('tickets-maintenance/refus-photo.jpg'))
  })

  it('marque le refus comme vu au chargement quand il ne l\'était pas encore', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      if (url.pathname === '/api/tickets-maintenance/1/refus-vu' && method === 'PATCH') {
        return new Response(JSON.stringify({ ...TICKET, statut: 'a_refaire' }), { status: 200 })
      }
      throw new Error(`Unhandled request: ${method} ${url.pathname}`)
    })
    globalThis.fetch = fetchMock as typeof fetch

    render(
      <TicketDetailAgent
        ticket={{
          ...TICKET,
          statut: 'a_refaire',
          refus: [{ motif: 'La fuite persiste.', motif_audio_url: null, motif_photo_url: null, vu: false, date: '2026-08-11T10:00:00Z' }],
        }}
        onBack={vi.fn()}
        onResolu={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/tickets-maintenance/1/refus-vu'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
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
  })

  it('permet de prendre plusieurs photos de réparation et les envoie toutes', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    const photoA = new File(['a'], 'reparation-1.jpg', { type: 'image/jpeg' })
    const photoB = new File(['b'], 'reparation-2.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo de la réparation/i), [photoA, photoB])

    expect(await screen.findByAltText('Aperçu de la photo 1')).toBeInTheDocument()
    expect(screen.getByAltText('Aperçu de la photo 2')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/prix de la réparation/i), '45')
    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).includes('/resoudre'))!
    const formData = init!.body as FormData
    expect(formData.getAll('photos_apres[]')).toHaveLength(2)
  })

  it('affiche un message clair quand la photo de réparation est trop lourde', async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 413 })) as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    const photo = new File(['x'], 'reparation.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo de la réparation/i), photo)
    await user.type(screen.getByLabelText(/prix de la réparation/i), '45')
    await user.click(screen.getByRole('button', { name: /marquer résolu/i }))

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })

  it('propose d\'envoyer un message au Manager quand le ticket est en cours (assigne)', () => {
    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.getByRole('button', { name: /envoyer un message au manager/i })).toBeInTheDocument()
  })

  it('ne propose pas d\'envoyer un message au Manager une fois le ticket résolu', () => {
    render(<TicketDetailAgent ticket={{ ...TICKET, statut: 'resolu' }} onBack={vi.fn()} onResolu={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /envoyer un message au manager/i })).not.toBeInTheDocument()
  })

  it('envoie un message texte au Manager, distinct de la résolution finale, et affiche une confirmation', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /envoyer un message au manager/i }))
    // Both this form and the (always-visible) resolution form below have a
    // "Note (optionnel)" field -- this one is the first in DOM order.
    await user.type(screen.getAllByLabelText(/note \(optionnel\)/i)[0], 'Une précision.')
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByTestId('message-agent-confirmation')).toBeInTheDocument()
    // Resolution form/button is untouched -- this was a separate action.
    expect(screen.getByRole('button', { name: /marquer résolu/i })).toBeInTheDocument()
  })

  it('refuse l\'envoi d\'un message sans photo, audio ni note', async () => {
    const user = userEvent.setup()
    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /envoyer un message au manager/i }))
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(screen.getByText(/ajoutez une photo, un audio ou une note/i)).toBeInTheDocument()
  })

  it('permet de joindre plusieurs photos à un message et les envoie toutes', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    globalThis.fetch = fetchMock as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /envoyer un message au manager/i }))
    const photoA = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const photoB = new File(['b'], 'b.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photo du message/i), [photoA, photoB])

    expect(await screen.findByAltText('Aperçu de la photo 1')).toBeInTheDocument()
    expect(screen.getByAltText('Aperçu de la photo 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).includes('/message'))!
    const formData = init!.body as FormData
    expect(formData.getAll('photos[]')).toHaveLength(2)
  })

  it('affiche un message clair quand la photo du message est trop lourde', async () => {
    const user = userEvent.setup()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 413 })) as typeof fetch

    render(<TicketDetailAgent ticket={TICKET} onBack={vi.fn()} onResolu={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /envoyer un message au manager/i }))
    await user.upload(
      screen.getByLabelText(/photo du message/i),
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    )
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })
})
