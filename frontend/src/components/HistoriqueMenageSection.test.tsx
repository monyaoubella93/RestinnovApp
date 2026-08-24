import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoriqueMenageSection } from './HistoriqueMenageSection'
import type { Appartement, HistoriqueMissionManager } from '../types'

const appartements: Appartement[] = [
  { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
  { id: 2, nom: 'Zenith', adresse: '5 avenue de la Paix', statut: 'disponible', photo_principale: null, agent_habituel_id: null },
]

function missionFixture(overrides: Partial<HistoriqueMissionManager> = {}): HistoriqueMissionManager {
  return {
    id: 1,
    sejour: {
      id: 1,
      reference: 'SEJ-0001',
      date_arrivee: '2026-01-01',
      date_depart: '2026-01-05',
      nom_voyageur: 'Jean Dupont',
    },
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    checklist_modeles_utilises: ['Standard'],
    checklist_items: [
      { libelle: "Passer l'aspirateur", checklist_modele_nom: 'Standard', coche: true, photo_url: null, photo_reference_url: null },
    ],
    produits: [
      { nom: 'Javel', prix: 12.5, photo_url: 'produits-catalogue/javel.jpg', type_utilisation: 'rachete', photo_preuve_url: null, prix_paye: 12.5 },
    ],
    frais_forfait: 50,
    frais_produits_total: 12.5,
    frais_total: 62.5,
    ...overrides,
  }
}

function mockFetch(missions: HistoriqueMissionManager[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/mission-menages/historique') {
      return new Response(JSON.stringify(missions), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('HistoriqueMenageSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche l\'appartement et le séjour concerné pour chaque entrée', async () => {
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<HistoriqueMenageSection appartements={appartements} />)

    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('Loft Bastille')).toBeInTheDocument()
    expect(within(row).getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(within(row).getByText('SEJ-0001')).toBeInTheDocument()
    expect(within(row).getByText('Jean Dupont')).toBeInTheDocument()
  })

  it('affiche la checklist, les produits (avec photo) et le total des frais au clic sur une entrée', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<HistoriqueMenageSection appartements={appartements} />)

    await screen.findByRole('listitem')
    await user.click(within(screen.getByRole('listitem')).getByText('Loft Bastille'))

    expect(screen.getByText("Passer l'aspirateur")).toBeInTheDocument()
    expect(screen.getByText(/Javel/)).toBeInTheDocument()
    expect(screen.getByAltText('Photo de "Javel"')).toBeInTheDocument()
    expect(screen.getByText('Total : 62.50 MAD')).toBeInTheDocument()
  })

  it('affiche un message quand il n\'y a aucune mission', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<HistoriqueMenageSection appartements={appartements} />)

    expect(await screen.findByText(/aucune mission de ménage validée/i)).toBeInTheDocument()
  })

  it('refiltre par appartement au changement du sélecteur', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch([missionFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<HistoriqueMenageSection appartements={appartements} />)
    await screen.findByRole('listitem')

    await user.selectOptions(screen.getByLabelText(/^appartement$/i), '2')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([input]) => String(input).includes('appartement_id=2'))
      expect(call).toBeDefined()
    })
  })

  it('refiltre par période au changement des dates', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch([missionFixture()])
    globalThis.fetch = fetchMock as typeof fetch

    render(<HistoriqueMenageSection appartements={appartements} />)
    await screen.findByRole('listitem')

    await user.type(screen.getByLabelText(/^du$/i), '2026-01-01')
    await user.type(screen.getByLabelText(/^au$/i), '2026-12-31')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([input]) => String(input).includes('date_debut=2026-01-01') && String(input).includes('date_fin=2026-12-31'),
      )
      expect(call).toBeDefined()
    })
  })
})
