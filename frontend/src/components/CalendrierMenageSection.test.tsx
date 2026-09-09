import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendrierMenageSection } from './CalendrierMenageSection'
import type { ChecklistItem, MissionCalendrierEntry, MissionMenage } from '../types'

const appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: '12 rue de la Roquette',
  statut: 'occupe',
  photo_principale: null,
  agent_habituel_id: null,
}

function entryFixture(overrides: Partial<MissionCalendrierEntry> = {}): MissionCalendrierEntry {
  return {
    id: 10,
    date: '2026-08-12',
    statut: 'a_faire',
    appartement: { id: 1, nom: 'Loft Bastille', adresse: '12 rue de la Roquette' },
    ...overrides,
  }
}

function checklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 1,
    mission_menage_id: 10,
    libelle: "Passer l'aspirateur",
    libelle_ar: null,
    coche: false,
    photo_url: null,
    photo_reference_url: null,
    ordre: 0,
    ...overrides,
  }
}

function missionFixture(overrides: Partial<MissionMenage> = {}): MissionMenage {
  return {
    id: 10,
    sejour_id: 1,
    agent_id: 1,
    statut: 'a_faire',
    agent: { id: 1, nom: 'Fatima Z.', role: 'menage', telephone: null },
    frais_forfait: 0,
    vue: false,
    produits: [],
    checklist_items: [checklistItem()],
    photos_preuve: [],
    sejour: { id: 1, appartement },
    ...overrides,
  }
}

function mockFetch(entries: MissionCalendrierEntry[], missionsById: Record<number, MissionMenage> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname

    if (path === '/api/mes-missions/calendrier' && method === 'GET') {
      return new Response(JSON.stringify(entries), { status: 200 })
    }

    const missionMatch = path.match(/^\/api\/mission-menages\/(\d+)$/)
    if (missionMatch && method === 'GET') {
      const mission = missionsById[Number(missionMatch[1])]
      return new Response(JSON.stringify(mission), { status: 200 })
    }

    const ouvrirMatch = path.match(/^\/api\/mission-menages\/(\d+)\/ouvrir$/)
    if (ouvrirMatch && method === 'PATCH') {
      const mission = missionsById[Number(ouvrirMatch[1])]
      return new Response(JSON.stringify({ ...mission, vue: true }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${method} ${path}`)
  })
}

describe('CalendrierMenageSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-15T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le mois courant avec le nom de l\'appartement sur le bon jour', async () => {
    const entry = entryFixture({ date: '2026-08-12', statut: 'a_faire' })
    globalThis.fetch = mockFetch([entry]) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)

    expect(await screen.findByText('Août 2026')).toBeInTheDocument()

    const jour12 = screen.getByTestId('calendrier-jour-2026-08-12')
    expect(within(jour12).getByRole('button', { name: 'Loft Bastille' })).toBeInTheDocument()
  })

  it('colore la mission selon son statut (mauve = en attente, vert = conforme, neutre = à faire)', async () => {
    const entries = [
      entryFixture({ id: 1, date: '2026-08-10', statut: 'a_faire', appartement: { id: 1, nom: 'A Faire', adresse: '' } }),
      entryFixture({ id: 2, date: '2026-08-11', statut: 'en_attente_validation', appartement: { id: 2, nom: 'En Attente', adresse: '' } }),
      entryFixture({ id: 3, date: '2026-08-12', statut: 'conforme', appartement: { id: 3, nom: 'Conforme', adresse: '' } }),
      entryFixture({ id: 4, date: '2026-08-13', statut: 'non_conforme', appartement: { id: 4, nom: 'Refusee', adresse: '' } }),
    ]
    globalThis.fetch = mockFetch(entries) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)
    await screen.findByText('Août 2026')

    expect(screen.getByRole('button', { name: 'A Faire' }).className).toContain('bg-table-header-bg')
    expect(screen.getByRole('button', { name: 'En Attente' }).className).toContain('bg-violet-bg')
    expect(screen.getByRole('button', { name: 'Conforme' }).className).toContain('bg-success-bg')
    expect(screen.getByRole('button', { name: 'Refusee' }).className).toContain('bg-danger-bg')
  })

  it('un clic sur une mission non conforme (a_faire/en_cours/en_attente/non_conforme) ouvre son détail interactif', async () => {
    const user = userEvent.setup()
    const entry = entryFixture({ id: 10, date: '2026-08-12', statut: 'a_faire' })
    const mission = missionFixture({ id: 10, statut: 'a_faire' })
    globalThis.fetch = mockFetch([entry], { 10: mission }) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)
    await screen.findByText('Août 2026')

    await user.click(screen.getByRole('button', { name: 'Loft Bastille' }))

    expect(await screen.findByText('← Retour à mes missions')).toBeInTheDocument()
    expect(screen.getAllByText('Loft Bastille').length).toBeGreaterThan(0)
  })

  it('un clic sur une mission conforme ouvre un détail en lecture seule, sans bouton "Marquer terminé"', async () => {
    const user = userEvent.setup()
    const entry = entryFixture({ id: 20, date: '2026-08-12', statut: 'conforme' })
    const mission = missionFixture({
      id: 20,
      statut: 'conforme',
      checklist_items: [checklistItem({ id: 1, coche: true })],
    })
    globalThis.fetch = mockFetch([entry], { 20: mission }) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)
    await screen.findByText('Août 2026')

    await user.click(screen.getByRole('button', { name: 'Loft Bastille' }))

    expect(await screen.findByText('Mission validée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /marquer terminé/i })).not.toBeInTheDocument()
  })

  it('navigue au mois précédent puis suivant', async () => {
    const user = userEvent.setup()
    const entryAout = entryFixture({ id: 1, date: '2026-08-12' })
    const entryJuillet = entryFixture({ id: 2, date: '2026-07-05', appartement: { id: 9, nom: 'Studio Marais', adresse: '' } })
    globalThis.fetch = mockFetch([entryAout, entryJuillet]) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)
    await screen.findByText('Août 2026')
    expect(screen.getByRole('button', { name: 'Loft Bastille' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mois précédent/i }))

    expect(await screen.findByText('Juillet 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Studio Marais' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Loft Bastille' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mois suivant/i }))

    expect(await screen.findByText('Août 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Loft Bastille' })).toBeInTheDocument()
  })

  it('affiche un message quand l\'agent n\'a jamais eu de mission', async () => {
    globalThis.fetch = mockFetch([]) as typeof fetch

    render(<CalendrierMenageSection catalogue={[]} />)

    expect(await screen.findByText('Aucune mission pour l\'instant.')).toBeInTheDocument()
  })
})
