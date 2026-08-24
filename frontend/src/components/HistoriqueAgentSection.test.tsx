import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoriqueAgentSection } from './HistoriqueAgentSection'
import type { HistoriqueMissionAgent } from '../types'

function missionFixture(overrides: Partial<HistoriqueMissionAgent> = {}): HistoriqueMissionAgent {
  return {
    id: 1,
    sejour: {
      id: 1,
      reference: 'SEJ-0001',
      date_arrivee: '2026-08-01',
      date_depart: '2026-08-05',
      nom_voyageur: 'Jean Dupont',
    },
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    checklist_modeles_utilises: ['Standard'],
    checklist_items: [{ libelle: 'Nettoyer la cuisine', checklist_modele_nom: 'Standard', coche: true, photo_url: null, photo_reference_url: null }],
    produits: [{ nom: 'Éponge', prix: 5, photo_url: null, type_utilisation: 'rachete', photo_preuve_url: null, prix_paye: 5 }],
    ...overrides,
  }
}

function mockFetch(missions: HistoriqueMissionAgent[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    if (url.pathname === '/api/mes-missions/historique') {
      return new Response(JSON.stringify(missions), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('HistoriqueAgentSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("charge et affiche l'historique avec nom, adresse et date", async () => {
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<HistoriqueAgentSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('05/08/2026')).toBeInTheDocument()
  })

  it("affiche un message quand l'agent n'a aucun ménage validé", async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<HistoriqueAgentSection />)

    expect(await screen.findByText(/aucun ménage validé/i)).toBeInTheDocument()
  })

  it('déplie le détail (checklist + produits) au clic', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<HistoriqueAgentSection />)

    await screen.findByText('Loft Bastille')
    expect(screen.queryByText('Nettoyer la cuisine')).not.toBeInTheDocument()

    await user.click(screen.getByText('Loft Bastille'))

    expect(screen.getByText('Nettoyer la cuisine')).toBeInTheDocument()
    expect(screen.getByText('Éponge')).toBeInTheDocument()
  })
})
