import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppartementsListeSection } from './AppartementsListeSection'
import type { Appartement, HistoriqueMission } from '../types'

function appartementFixture(overrides: Partial<Appartement> = {}): Appartement {
  return {
    id: 1,
    nom: 'Loft Bastille',
    adresse: '12 rue de la Roquette',
    statut: 'disponible',
    photo_principale: null,
    agent_habituel_id: null,
    checklist_modeles: [],
    agent_habituel: null,
    sejours_count: 3,
    dernier_sejour: '2026-03-05',
    ...overrides,
  }
}

/** Fakes the backend's filter/sort/pagination behaviour over an in-memory list of appartements. */
function mockFetchAppartements(all: Appartement[], historique: Record<number, HistoriqueMission[]> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))

    const historiqueMatch = url.pathname.match(/^\/api\/appartements\/(\d+)\/historique$/)
    if (historiqueMatch) {
      const id = Number(historiqueMatch[1])
      return new Response(JSON.stringify(historique[id] ?? []), { status: 200 })
    }

    let result = [...all]

    const search = url.searchParams.get('search')
    if (search) {
      const needle = search.toLowerCase()
      result = result.filter(
        (a) => a.nom.toLowerCase().includes(needle) || a.adresse.toLowerCase().includes(needle),
      )
    }

    const statut = url.searchParams.get('statut')
    if (statut) result = result.filter((a) => a.statut === statut)

    const sortDir = url.searchParams.get('sort_dir') ?? 'asc'
    result.sort((a, b) => (sortDir === 'asc' ? a.nom.localeCompare(b.nom) : b.nom.localeCompare(a.nom)))

    const perPage = Number(url.searchParams.get('per_page') ?? 10)
    const page = Number(url.searchParams.get('page') ?? 1)
    const total = result.length
    const lastPage = Math.max(1, Math.ceil(total / perPage))
    const data = result.slice((page - 1) * perPage, page * perPage)

    return new Response(
      JSON.stringify({ data, current_page: page, last_page: lastPage, per_page: perPage, total }),
      { status: 200 },
    )
  })
}

describe('AppartementsListeSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche le compteur et les colonnes attendues', async () => {
    globalThis.fetch = mockFetchAppartements([appartementFixture()]) as typeof fetch

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0)
    expect(screen.getByText('Aucune')).toBeInTheDocument()
    expect(screen.getByText('Aucun')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('05/03/2026')).toBeInTheDocument()
  })

  it('filtre par recherche sur le nom ou l\'adresse', async () => {
    globalThis.fetch = mockFetchAppartements([
      appartementFixture({ id: 1, nom: 'Loft Bastille', adresse: 'Rue de Paris' }),
      appartementFixture({ id: 2, nom: 'Zenith', adresse: 'Avenue Hassan II' }),
    ]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('2 appartements trouvés')
    await user.type(screen.getByLabelText(/recherche/i), 'Hassan')

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Zenith')).toBeInTheDocument()
    expect(screen.queryByText('Loft Bastille')).not.toBeInTheDocument()
  })

  it('filtre par statut', async () => {
    globalThis.fetch = mockFetchAppartements([
      appartementFixture({ id: 1, nom: 'Loft Bastille', statut: 'disponible' }),
      appartementFixture({ id: 2, nom: 'Zenith', statut: 'occupe' }),
    ]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('2 appartements trouvés')
    await user.selectOptions(screen.getByLabelText(/statut/i), 'occupe')

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Zenith')).toBeInTheDocument()
  })

  it('affiche le badge "En ménage" et permet de filtrer dessus', async () => {
    globalThis.fetch = mockFetchAppartements([
      appartementFixture({ id: 1, nom: 'Loft Bastille', statut: 'disponible' }),
      appartementFixture({ id: 2, nom: 'Zenith', statut: 'en_menage' }),
    ]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('2 appartements trouvés')
    expect(within(screen.getByRole('table')).getByText('En ménage')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/statut/i), 'en_menage')

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Zenith')).toBeInTheDocument()
  })

  it('affiche le badge "Maintenance" et permet de filtrer dessus', async () => {
    globalThis.fetch = mockFetchAppartements([
      appartementFixture({ id: 1, nom: 'Loft Bastille', statut: 'disponible' }),
      appartementFixture({ id: 2, nom: 'Zenith', statut: 'maintenance' }),
    ]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('2 appartements trouvés')
    expect(within(screen.getByRole('table')).getByText('Maintenance')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/statut/i), 'maintenance')

    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByText('Zenith')).toBeInTheDocument()
  })

  it('trie par nom et inverse le sens au second clic', async () => {
    globalThis.fetch = mockFetchAppartements([
      appartementFixture({ id: 1, nom: 'Zenith' }),
      appartementFixture({ id: 2, nom: 'Loft Bastille' }),
    ]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('2 appartements trouvés')

    const rowsOrder = () =>
      screen.getAllByRole('row').slice(1).map((r) => within(r).queryByText(/Zenith|Loft Bastille/)?.textContent)

    await waitFor(() => expect(rowsOrder()).toEqual(['Loft Bastille', 'Zenith']))

    await user.click(screen.getByRole('button', { name: /^nom/i }))
    await waitFor(() => expect(rowsOrder()).toEqual(['Zenith', 'Loft Bastille']))
  })

  it('affiche la pagination et change de page', async () => {
    const appartements = Array.from({ length: 12 }, (_, i) =>
      appartementFixture({ id: i + 1, nom: `Appartement ${String(i + 1).padStart(2, '0')}` }),
    )
    globalThis.fetch = mockFetchAppartements(appartements) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    expect(await screen.findByText('12 appartements trouvés')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled()
    expect(screen.getAllByRole('row')).toHaveLength(11)

    await user.click(screen.getByRole('button', { name: '2' }))

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Suivant' })).toBeDisabled()
  })

  it('le bouton "+ Nouvel appartement" appelle onNavigateToCreer', async () => {
    globalThis.fetch = mockFetchAppartements([]) as typeof fetch
    const onNavigateToCreer = vi.fn()
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={onNavigateToCreer} onEditAppartement={vi.fn()} />)

    await screen.findByText('0 appartements trouvés')
    await user.click(screen.getByRole('button', { name: /nouvel appartement/i }))

    expect(onNavigateToCreer).toHaveBeenCalledTimes(1)
  })

  it('l\'icône crayon appelle onEditAppartement avec l\'appartement', async () => {
    globalThis.fetch = mockFetchAppartements([appartementFixture()]) as typeof fetch
    const onEditAppartement = vi.fn()
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={onEditAppartement} />)

    await screen.findByText('1 appartements trouvés')
    await user.click(screen.getByRole('button', { name: /modifier l'appartement loft bastille/i }))

    expect(onEditAppartement).toHaveBeenCalledWith(expect.objectContaining({ id: 1, nom: 'Loft Bastille' }))
  })

  it('l\'icône œil affiche le détail de l\'appartement, avec un bouton de retour', async () => {
    globalThis.fetch = mockFetchAppartements([appartementFixture()]) as typeof fetch
    const user = userEvent.setup()

    render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

    await screen.findByText('1 appartements trouvés')
    await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))

    expect(await screen.findByText('Checklists assignées')).toBeInTheDocument()
    expect(screen.getByText('Nombre de séjours')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retour à la liste/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /retour à la liste/i }))
    expect(await screen.findByText('1 appartements trouvés')).toBeInTheDocument()
  })

  describe('onglet "Historique ménage"', () => {
    const mission: HistoriqueMission = {
      id: 5,
      statut: 'conforme',
      sejour: {
        id: 1,
        reference: 'SEJ-0001',
        date_arrivee: '2026-01-01',
        date_depart: '2026-01-05',
        nom_voyageur: 'Jean Dupont',
      },
      checklist_modeles_utilises: ['Standard'],
      checklist_items: [{ libelle: "Passer l'aspirateur", checklist_modele_nom: 'Standard', coche: true, photo_url: null, photo_reference_url: null }],
      produits: [{ nom: 'Javel', prix: 12.5, photo_url: null, type_utilisation: 'rachete', photo_preuve_url: null, prix_paye: 12.5 }],
      frais_forfait: 50,
      frais_produits_total: 12.5,
      frais_total: 62.5,
    }

    it('affiche la liste chronologique des missions passées, dépliable ligne par ligne', async () => {
      globalThis.fetch = mockFetchAppartements([appartementFixture()], { 1: [mission] }) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))
      await user.click(screen.getByRole('button', { name: 'Historique ménage' }))

      expect(await screen.findByText('SEJ-0001')).toBeInTheDocument()
      expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
      expect(screen.getByText('Conforme')).toBeInTheDocument()
      expect(screen.queryByText("Passer l'aspirateur")).not.toBeInTheDocument()

      await user.click(screen.getByText('Jean Dupont'))

      expect(await screen.findByText("Passer l'aspirateur")).toBeInTheDocument()
      expect(screen.getByText(/Javel/)).toBeInTheDocument()
      expect(screen.getByText('Total : 62.50 MAD')).toBeInTheDocument()
    })

    it('affiche un message quand l\'appartement n\'a aucune mission passée', async () => {
      globalThis.fetch = mockFetchAppartements([appartementFixture()], { 1: [] }) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))
      await user.click(screen.getByRole('button', { name: 'Historique ménage' }))

      expect(await screen.findByText(/aucune mission de ménage/i)).toBeInTheDocument()
    })
  })
})
