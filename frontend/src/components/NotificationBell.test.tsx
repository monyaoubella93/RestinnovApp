import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell } from './NotificationBell'
import type { NotificationsData } from '../types'

function notificationsFixture(overrides: Partial<NotificationsData> = {}): NotificationsData {
  return {
    menages_a_valider_count: 0,
    problemes_signales_count: 0,
    alertes_maintenance_count: 0,
    menages_a_valider: [],
    problemes_signales: [],
    alertes_maintenance: [],
    ...overrides,
  }
}

function mockFetch(data: NotificationsData) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/notifications') {
      return new Response(JSON.stringify(data), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("n'affiche aucun badge quand il n'y a rien en attente", async () => {
    globalThis.fetch = mockFetch(notificationsFixture()) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })

  it('affiche un badge ambre quand seuls des ménages sont à valider', async () => {
    globalThis.fetch = mockFetch(
      notificationsFixture({
        menages_a_valider_count: 2,
        menages_a_valider: [
          { id: 1, sejour_id: 10, nom_voyageur: 'Jean Dupont', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
          { id: 2, sejour_id: 11, nom_voyageur: 'Marie Curie', appartement: { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix' } },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    const badge = await screen.findByTestId('notification-badge')
    expect(badge).toHaveTextContent('2')
    expect(badge).toHaveClass('bg-warning')
  })

  it('affiche un badge rouge dès qu\'un problème est signalé, même avec des ménages en attente', async () => {
    globalThis.fetch = mockFetch(
      notificationsFixture({
        menages_a_valider_count: 1,
        menages_a_valider: [
          { id: 1, sejour_id: 10, nom_voyageur: 'Jean Dupont', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
        ],
        problemes_signales_count: 1,
        problemes_signales: [
          { id: 1, urgence: 'haute', statut: 'ouvert', appartement: { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix' } },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    const badge = await screen.findByTestId('notification-badge')
    expect(badge).toHaveTextContent('2')
    expect(badge).toHaveClass('bg-danger')
  })

  it('affiche un badge bleu quand seules des alertes rappel sont en attente', async () => {
    globalThis.fetch = mockFetch(
      notificationsFixture({
        alertes_maintenance_count: 1,
        alertes_maintenance: [
          { id: 1, niveau: 'rappel', message: 'Le ticket MNT-0001 arrive à échéance demain.', ticket_maintenance_id: 1, appartement: null },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    const badge = await screen.findByTestId('notification-badge')
    expect(badge).toHaveTextContent('1')
    expect(badge).toHaveClass('bg-brand')
  })

  it('affiche un badge orange quand une alerte urgente est en attente, même sans problème signalé', async () => {
    globalThis.fetch = mockFetch(
      notificationsFixture({
        alertes_maintenance_count: 1,
        alertes_maintenance: [
          { id: 1, niveau: 'urgente', message: 'Le ticket MNT-0001 est en retard.', ticket_maintenance_id: 1, appartement: null },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    const badge = await screen.findByTestId('notification-badge')
    expect(badge).toHaveClass('bg-warning')
  })

  it('affiche un badge rouge dès qu\'une alerte critique est en attente, même sans problème signalé', async () => {
    globalThis.fetch = mockFetch(
      notificationsFixture({
        alertes_maintenance_count: 1,
        alertes_maintenance: [
          { id: 1, niveau: 'critique', message: 'Voyageur bientôt, ticket non résolu.', ticket_maintenance_id: 1, appartement: null },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    const badge = await screen.findByTestId('notification-badge')
    expect(badge).toHaveClass('bg-danger')
  })

  it('affiche les 3 niveaux d\'alerte de maintenance avec des couleurs distinctes dans le panneau', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      notificationsFixture({
        alertes_maintenance_count: 3,
        alertes_maintenance: [
          { id: 1, niveau: 'critique', message: 'Voyageur bientôt, ticket non résolu.', ticket_maintenance_id: 1, appartement: null },
          { id: 2, niveau: 'urgente', message: 'Le ticket MNT-0002 est en retard.', ticket_maintenance_id: 2, appartement: null },
          { id: 3, niveau: 'rappel', message: 'Le ticket MNT-0003 arrive à échéance demain.', ticket_maintenance_id: 3, appartement: null },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    await screen.findByTestId('notification-badge')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByText('Alertes de maintenance')).toBeInTheDocument()
    expect(screen.getByText('Voyageur bientôt, ticket non résolu.')).toBeInTheDocument()
    expect(screen.getByText('Le ticket MNT-0002 est en retard.')).toBeInTheDocument()
    expect(screen.getByText('Le ticket MNT-0003 arrive à échéance demain.')).toBeInTheDocument()

    const critiqueLabel = screen.getByText('Critique')
    expect(critiqueLabel).toHaveClass('bg-danger-bg', 'text-danger')
    const urgenteLabel = screen.getByText('Urgente')
    expect(urgenteLabel).toHaveClass('bg-warning-bg', 'text-warning-text')
    const rappelLabel = screen.getByText('Rappel')
    expect(rappelLabel).toHaveClass('bg-brand-pale', 'text-brand')
  })

  it('le clic sur une alerte de maintenance navigue vers les tickets de maintenance et ferme le panneau', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketsMaintenance = vi.fn()
    globalThis.fetch = mockFetch(
      notificationsFixture({
        alertes_maintenance_count: 1,
        alertes_maintenance: [
          { id: 1, niveau: 'urgente', message: 'Le ticket MNT-0001 est en retard.', ticket_maintenance_id: 1, appartement: null },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={onNavigateToTicketsMaintenance} />)

    await screen.findByTestId('notification-badge')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.click(screen.getByText('Le ticket MNT-0001 est en retard.'))

    expect(onNavigateToTicketsMaintenance).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Alertes de maintenance')).not.toBeInTheDocument()
  })

  it('ouvre un panneau avec les deux sections colorées, nom + adresse par ligne', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      notificationsFixture({
        menages_a_valider_count: 1,
        menages_a_valider: [
          { id: 1, sejour_id: 10, nom_voyageur: 'Jean Dupont', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
        ],
        problemes_signales_count: 1,
        problemes_signales: [
          { id: 1, urgence: 'haute', statut: 'ouvert', appartement: { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix' } },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    await screen.findByTestId('notification-badge')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByText('Ménages à valider')).toBeInTheDocument()
    expect(screen.getByText('Problèmes signalés')).toBeInTheDocument()
    expect(screen.getByText('Loft Bastille — 12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Zenith — 5 avenue de la Paix')).toBeInTheDocument()

    const menagesSection = screen.getByText('Ménages à valider').closest('div')
    expect(menagesSection).toHaveClass('border-amber-200')
    const problemesSection = screen.getByText('Problèmes signalés').closest('div')
    expect(problemesSection).toHaveClass('border-red-200')
  })

  it('le clic sur une ligne "ménage à valider" navigue vers le séjour et ferme le panneau', async () => {
    const user = userEvent.setup()
    const onNavigateToSejour = vi.fn()
    globalThis.fetch = mockFetch(
      notificationsFixture({
        menages_a_valider_count: 1,
        menages_a_valider: [
          { id: 1, sejour_id: 42, nom_voyageur: 'Jean Dupont', appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' } },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={onNavigateToSejour} onNavigateToTicketsMaintenance={vi.fn()} />)

    await screen.findByTestId('notification-badge')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.click(screen.getByText('Loft Bastille — 12 rue de la Roquette'))

    expect(onNavigateToSejour).toHaveBeenCalledWith(42)
    expect(screen.queryByText('Ménages à valider')).not.toBeInTheDocument()
  })

  it('le clic sur une ligne "problème signalé" navigue vers les tickets de maintenance', async () => {
    const user = userEvent.setup()
    const onNavigateToTicketsMaintenance = vi.fn()
    globalThis.fetch = mockFetch(
      notificationsFixture({
        problemes_signales_count: 1,
        problemes_signales: [
          { id: 1, urgence: 'haute', statut: 'ouvert', appartement: { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix' } },
        ],
      }),
    ) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={onNavigateToTicketsMaintenance} />)

    await screen.findByTestId('notification-badge')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.click(screen.getByText('Zenith — 5 avenue de la Paix'))

    expect(onNavigateToTicketsMaintenance).toHaveBeenCalledTimes(1)
  })

  it('affiche un état vide simple quand rien n\'est en attente', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(notificationsFixture()) as typeof fetch

    render(<NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />)

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(screen.getByText('Aucune notification en attente.')).toBeInTheDocument()
  })

  it('referme le panneau au clic en dehors', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(notificationsFixture()) as typeof fetch

    render(
      <div>
        <NotificationBell onNavigateToSejour={vi.fn()} onNavigateToTicketsMaintenance={vi.fn()} />
        <div data-testid="outside">Ailleurs</div>
      </div>,
    )

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('Aucune notification en attente.')).toBeInTheDocument()

    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByText('Aucune notification en attente.')).not.toBeInTheDocument()
  })
})
