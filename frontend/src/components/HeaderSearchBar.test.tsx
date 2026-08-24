import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchBar } from './HeaderSearchBar'
import type { Appartement, Sejour } from '../types'

const sejour: Sejour = {
  id: 1,
  reference: 'SEJ-0001',
  appartement_id: 1,
  date_arrivee: '2026-08-01',
  date_depart: '2026-08-05',
  nom_voyageur: 'Jean Dupont',
  statut: 'a_venir',
  plateforme_origine: 'airbnb',
  montant_mad: 1000,
  appartement: {
    id: 1,
    nom: 'Loft Bastille',
    adresse: '12 rue de la Roquette',
    statut: 'disponible',
    photo_principale: null,
    agent_habituel_id: null,
  },
}

const appartement: Appartement = {
  id: 2,
  nom: 'Studio Marais',
  adresse: '5 rue des Rosiers',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

function mockFetch({
  sejours = [],
  appartements = [],
}: { sejours?: Sejour[]; appartements?: Appartement[] } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/sejours') {
      return new Response(
        JSON.stringify({ data: sejours, current_page: 1, last_page: 1, per_page: 5, total: sejours.length }),
        { status: 200 },
      )
    }

    if (url.pathname === '/api/appartements') {
      return new Response(
        JSON.stringify({ data: appartements, current_page: 1, last_page: 1, per_page: 5, total: appartements.length }),
        { status: 200 },
      )
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('HeaderSearchBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("n'affiche aucun menu déroulant quand le champ est vide", () => {
    globalThis.fetch = mockFetch() as typeof fetch

    render(<HeaderSearchBar onNavigateToSejour={vi.fn()} onNavigateToAppartement={vi.fn()} />)

    expect(screen.queryByTestId('header-search-results')).not.toBeInTheDocument()
  })

  it('recherche après un délai et affiche séjours et appartements groupés séparément', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch({ sejours: [sejour], appartements: [appartement] }) as typeof fetch

    render(<HeaderSearchBar onNavigateToSejour={vi.fn()} onNavigateToAppartement={vi.fn()} />)

    await user.type(screen.getByLabelText(/rechercher un séjour, un appartement/i), 'Bastille')

    expect(await screen.findByText('Séjours', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText(/SEJ-0001/)).toBeInTheDocument()
    expect(screen.getByText('Appartements')).toBeInTheDocument()
    expect(screen.getByText(/Studio Marais/)).toBeInTheDocument()
  })

  it('affiche "Aucun résultat trouvé" quand rien ne correspond', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch() as typeof fetch

    render(<HeaderSearchBar onNavigateToSejour={vi.fn()} onNavigateToAppartement={vi.fn()} />)

    await user.type(screen.getByLabelText(/rechercher un séjour, un appartement/i), 'Inexistant')

    expect(await screen.findByText(/aucun résultat trouvé/i, {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('navigue vers le séjour au clic sur un résultat de type séjour', async () => {
    const user = userEvent.setup()
    const onNavigateToSejour = vi.fn()
    globalThis.fetch = mockFetch({ sejours: [sejour] }) as typeof fetch

    render(<HeaderSearchBar onNavigateToSejour={onNavigateToSejour} onNavigateToAppartement={vi.fn()} />)

    await user.type(screen.getByLabelText(/rechercher un séjour, un appartement/i), 'Dupont')

    await user.click(await screen.findByText(/SEJ-0001/, {}, { timeout: 2000 }))

    expect(onNavigateToSejour).toHaveBeenCalledWith(1)
    expect(screen.queryByTestId('header-search-results')).not.toBeInTheDocument()
  })

  it("navigue vers l'appartement au clic sur un résultat de type appartement", async () => {
    const user = userEvent.setup()
    const onNavigateToAppartement = vi.fn()
    globalThis.fetch = mockFetch({ appartements: [appartement] }) as typeof fetch

    render(<HeaderSearchBar onNavigateToSejour={vi.fn()} onNavigateToAppartement={onNavigateToAppartement} />)

    await user.type(screen.getByLabelText(/rechercher un séjour, un appartement/i), 'Marais')

    await user.click(await screen.findByText(/Studio Marais/, {}, { timeout: 2000 }))

    expect(onNavigateToAppartement).toHaveBeenCalledWith(appartement)
    expect(screen.queryByTestId('header-search-results')).not.toBeInTheDocument()
  })
})
