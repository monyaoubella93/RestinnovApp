import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MenageAValiderSection } from './MenageAValiderSection'
import type { MissionMenage, ProduitCatalogue } from '../types'

const CATALOGUE: ProduitCatalogue[] = [
  { id: 1, nom: 'Javel', prix: 12, photo_url: null, actif: true },
  { id: 2, nom: 'Éponges', prix: 8, photo_url: null, actif: true },
]

function missionFixture(overrides: Partial<MissionMenage> = {}): MissionMenage {
  return {
    id: 10,
    sejour_id: 1,
    agent_id: 5,
    statut: 'en_attente_validation',
    agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
    frais_forfait: 50,
    vue: true,
    produits: [],
    checklist_items: [],
    produits_signales: [],
    photos_preuve: [],
    sejour: {
      id: 1,
      reference: 'SEJ-0001',
      nom_voyageur: 'Jean Dupont',
      date_arrivee: '2026-01-01',
      date_depart: '2026-01-05',
      appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette', statut: 'occupe', photo_principale: null, agent_habituel_id: null },
    },
    ...overrides,
  }
}

function mockFetch(missions: MissionMenage[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/mission-menages/a-valider' && method === 'GET') {
      return new Response(JSON.stringify(missions), { status: 200 })
    }

    if (/\/api\/mission-menages\/\d+\/valider$/.test(url.pathname) && method === 'PATCH') {
      return new Response(JSON.stringify({ ...missions[0], statut: 'conforme' }), { status: 200 })
    }

    if (/\/api\/mission-menages\/\d+\/refuser$/.test(url.pathname) && method === 'POST') {
      return new Response(JSON.stringify({ ...missions[0], statut: 'non_conforme' }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${url.pathname}`)
  })
}

describe('MenageAValiderSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche chaque mission en attente avec son appartement, séjour et agent', async () => {
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<MenageAValiderSection catalogue={CATALOGUE} />)

    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('Loft Bastille')).toBeInTheDocument()
    expect(within(row).getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(within(row).getByText(/SEJ-0001/)).toBeInTheDocument()
    expect(within(row).getByText('Fatima Z.')).toBeInTheDocument()
  })

  it("le détail de la mission est strictement en lecture seule pour les produits (aucune saisie Manager)", async () => {
    const user = userEvent.setup()
    const mission = missionFixture({
      produits: [
        {
          id: 1,
          nom: 'Javel',
          prix: 12,
          photo_url: null,
          actif: true,
          pivot: { type_utilisation: 'rachete', prix_paye: 9.5, photo_url: 'produits/javel-preuve.jpg' },
        },
      ],
    })
    globalThis.fetch = mockFetch([mission]) as typeof fetch

    render(<MenageAValiderSection catalogue={CATALOGUE} />)

    await screen.findByRole('listitem')
    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    // Javel was resolved by the agent as "racheté" -- shown read-only.
    expect(screen.getByText(/racheté · 9\.50 mad/i)).toBeInTheDocument()
    // Éponges was never touched by the agent -- placeholder, not a picker.
    expect(screen.getByText('En attente de la femme de ménage')).toBeInTheDocument()

    // No agent-only input control (photo/prix/envoyer/picker) exists anywhere on this screen.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^envoyer$/i })).not.toBeInTheDocument()
  })

  it('affiche un message quand aucune mission n\'est en attente', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<MenageAValiderSection catalogue={CATALOGUE} />)

    expect(await screen.findByText(/aucun ménage en attente de validation/i)).toBeInTheDocument()
  })

  it('retire la mission de la liste au clic sur "Valider"', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<MenageAValiderSection catalogue={CATALOGUE} />)

    await screen.findByRole('listitem')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await screen.findByText(/aucun ménage en attente de validation/i)
  })

  it('retire la mission de la liste après un refus confirmé', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch([missionFixture()]) as typeof fetch

    render(<MenageAValiderSection catalogue={CATALOGUE} />)

    await screen.findByRole('listitem')
    await user.click(screen.getByRole('button', { name: 'Refuser' }))

    await user.type(await screen.findByLabelText(/motif du refus/i), 'Salle de bain non nettoyée')
    await user.click(screen.getByRole('button', { name: /confirmer le refus/i }))

    await screen.findByText(/aucun ménage en attente de validation/i)
  })
})
