import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MesTicketsSection } from './MesTicketsSection'
import type { MonTicketMaintenance } from '../types'

function ticketFixture(overrides: Partial<MonTicketMaintenance> = {}): MonTicketMaintenance {
  return {
    id: 1,
    reference: 'MNT-0001',
    statut: 'assigne',
    urgence: 'normale',
    description_manager: 'Changer le joint du robinet.',
    description_manager_audio_url: null,
    photo_url: null,
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    refus: [],
    ...overrides,
  }
}

function renderSection(overrides: Partial<ComponentProps<typeof MesTicketsSection>> = {}) {
  return render(
    <MesTicketsSection
      tickets={[]}
      loading={false}
      error={null}
      emptyIcon="✅"
      emptyMessage="Aucun ticket pour l'instant."
      onRefresh={vi.fn()}
      {...overrides}
    />,
  )
}

describe('MesTicketsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("affiche les tickets passés en props avec appartement, urgence et description", () => {
    renderSection({ tickets: [ticketFixture()] })

    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Changer le joint du robinet.')).toBeInTheDocument()
    expect(screen.getByText('Urgence Normale')).toBeInTheDocument()
  })

  it('affiche la référence du ticket et le badge rouge "Refusé" pour un ticket a_refaire', () => {
    const ticket = ticketFixture({
      statut: 'a_refaire',
      refus: [{ motif: 'La fuite persiste.', motif_audio_url: null, motif_photo_url: null, vu: true, date: '2026-08-11T10:00:00Z' }],
    })
    renderSection({ tickets: [ticket] })

    expect(screen.getByText('MNT-0001')).toBeInTheDocument()
    const badge = screen.getByText('Refusé')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-danger-bg', 'text-danger')
  })

  it('affiche un badge violet "En attente de validation" pour un ticket resolu_en_attente_validation', () => {
    renderSection({ tickets: [ticketFixture({ statut: 'resolu_en_attente_validation' })] })

    const badge = screen.getByText('En attente de validation')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-violet-bg', 'text-violet')
  })

  it("affiche le message vide passé en props quand la liste est vide", () => {
    renderSection({ tickets: [] })

    expect(screen.getByText(/aucun ticket pour l'instant/i)).toBeInTheDocument()
  })

  it('ouvre le détail du ticket au clic sur la carte', async () => {
    const user = userEvent.setup()
    renderSection({ tickets: [ticketFixture()] })

    await user.click(screen.getByText('Loft Bastille'))

    expect(screen.getByText('Marquer comme résolu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retour à mes tickets/i })).toBeInTheDocument()
  })

  it('reste sur la confirmation de résolution même une fois le ticket disparu de la liste rafraîchie', async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'

      if (url.pathname === '/api/tickets-maintenance/1/resoudre' && method === 'POST') {
        return new Response(
          JSON.stringify({ ...ticketFixture(), statut: 'resolu_en_attente_validation' }),
          { status: 200 },
        )
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`)
    }) as typeof fetch

    renderSection({ tickets: [ticketFixture()] })

    await user.click(screen.getByText('Loft Bastille'))
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
