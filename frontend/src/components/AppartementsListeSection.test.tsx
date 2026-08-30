import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppartementsListeSection } from './AppartementsListeSection'
import type { Appartement, AppartementDetail, HistoriqueMission } from '../types'

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

function appartementDetailFixture(overrides: Partial<AppartementDetail> = {}, appartementOverrides: Partial<Appartement> = {}): AppartementDetail {
  return {
    appartement: appartementFixture(appartementOverrides),
    resume_financier: {
      mois: '2026-08',
      revenus_bruts: 1000,
      frais_menage_total: 100,
      frais_maintenance_total: 50,
      resultat_net: 850,
    },
    tickets_maintenance: [],
    tickets_maintenance_recurrent: false,
    ...overrides,
  }
}

/** Fakes the backend's filter/sort/pagination behaviour over an in-memory list of appartements. */
function mockFetchAppartements(
  all: Appartement[],
  historique: Record<number, HistoriqueMission[]> = {},
  details: Record<number, AppartementDetail> = {},
  deleteBlockedMessage: Record<number, string> = {},
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    const historiqueMatch = url.pathname.match(/^\/api\/appartements\/(\d+)\/historique$/)
    if (historiqueMatch) {
      const id = Number(historiqueMatch[1])
      return new Response(JSON.stringify(historique[id] ?? []), { status: 200 })
    }

    const detailMatch = url.pathname.match(/^\/api\/appartements\/(\d+)$/)
    if (detailMatch && method === 'DELETE') {
      const id = Number(detailMatch[1])
      if (deleteBlockedMessage[id]) {
        return new Response(JSON.stringify({ message: deleteBlockedMessage[id] }), { status: 422 })
      }
      return new Response(null, { status: 204 })
    }
    if (detailMatch) {
      const id = Number(detailMatch[1])
      const appartement = all.find((a) => a.id === id)
      const detail = details[id] ?? appartementDetailFixture({}, appartement ?? {})
      return new Response(JSON.stringify(detail), { status: 200 })
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

  describe('sections du détail enrichi', () => {
    it('affiche le propriétaire, les charges actives et le résumé financier du mois en cours', async () => {
      const appartement = appartementFixture()
      const detail = appartementDetailFixture(
        {
          appartement: {
            ...appartement,
            proprietaire: { id: 9, nom: 'Karim Alaoui', telephone: '0600000000', email: null, adresse: null },
            mode_gestion: 'mandat',
            taux_commission: 20,
            charges_actives: [
              { id: 1, nom_service: 'WiFi', montant: 149, frequence: 'mensuel', a_charge_de: 'restinnov', date_debut: '2026-01-01', date_fin: null },
            ],
          },
        },
      )
      globalThis.fetch = mockFetchAppartements([appartement], {}, { 1: detail }) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))

      expect(await screen.findByText('Karim Alaoui')).toBeInTheDocument()
      expect(screen.getByText('0600000000')).toBeInTheDocument()
      expect(screen.getByText('MANDAT')).toBeInTheDocument()

      expect(screen.getByText('WiFi', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('149.00 MAD')).toBeInTheDocument()
      expect(screen.getByText('À la charge de RestInnov')).toBeInTheDocument()

      expect(screen.getByText('Résumé financier (mois en cours)')).toBeInTheDocument()
      expect(screen.getByText('1000.00 MAD')).toBeInTheDocument()
      expect(screen.getByText('850.00 MAD')).toBeInTheDocument()
    })

    it('affiche un message quand aucun propriétaire ou aucune charge n\'est renseigné', async () => {
      globalThis.fetch = mockFetchAppartements([appartementFixture()]) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))

      expect(await screen.findByText('Aucun propriétaire renseigné.')).toBeInTheDocument()
      expect(screen.getByText('Aucune charge active.')).toBeInTheDocument()
    })

    it('liste les tickets de maintenance liés avec leur statut et le badge "Récurrent"', async () => {
      const appartement = appartementFixture()
      const detail = appartementDetailFixture({
        tickets_maintenance: [
          {
            id: 1,
            reference: 'MNT-0001',
            appartement_id: 1,
            mission_origine_id: null,
            agent_id: null,
            description: 'Robinet qui fuit.',
            description_manager: null,
            description_manager_audio_url: null,
            photo_url: null,
            photo_transferee: false,
            audio_url: null,
            photo_apres: null,
            cout_reparation: null,
            note_resolution: null,
            urgence: 'normale',
            statut: 'ouvert',
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
        tickets_maintenance_recurrent: true,
      })
      globalThis.fetch = mockFetchAppartements([appartement], {}, { 1: detail }) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))

      expect(await screen.findByText('MNT-0001', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('Ouvert')).toBeInTheDocument()
      expect(screen.getByTestId('recurrent-badge-1')).toBeInTheDocument()
    })

    it('les boutons d\'action rapide déclenchent la navigation et le téléchargement du PDF', async () => {
      const fetchMock = mockFetchAppartements([appartementFixture()])
      globalThis.fetch = fetchMock as typeof fetch
      const onNavigateToCreerSejour = vi.fn()
      const onNavigateToReleves = vi.fn()
      const onEditAppartement = vi.fn()
      const user = userEvent.setup()

      URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
      URL.revokeObjectURL = vi.fn()

      render(
        <AppartementsListeSection
          onNavigateToCreer={vi.fn()}
          onEditAppartement={onEditAppartement}
          onNavigateToCreerSejour={onNavigateToCreerSejour}
          onNavigateToReleves={onNavigateToReleves}
        />,
      )

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /voir le détail de l'appartement loft bastille/i }))
      await screen.findByText('Résumé financier (mois en cours)')

      await user.click(screen.getByRole('button', { name: 'Créer un séjour' }))
      expect(onNavigateToCreerSejour).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: "Modifier l'appartement" }))
      expect(onEditAppartement).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

      await user.click(screen.getByRole('button', { name: 'Voir le relevé complet →' }))
      expect(onNavigateToReleves).toHaveBeenCalledTimes(1)

      await user.click(screen.getByRole('button', { name: /télécharger le relevé pdf du mois/i }))
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/appartements/1/releve/pdf?mois='), expect.anything()),
      )
    })
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

  describe('suppression d\'un appartement', () => {
    it('demande confirmation avant de supprimer, puis retire la ligne et affiche un succès', async () => {
      globalThis.fetch = mockFetchAppartements([appartementFixture()]) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /supprimer l'appartement loft bastille/i }))

      expect(
        screen.getByText('Êtes-vous sûr de vouloir supprimer Loft Bastille ? Cette action est irréversible.'),
      ).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))

      expect(await screen.findByText('Appartement supprimé avec succès.')).toBeInTheDocument()
      expect(screen.queryByText('Loft Bastille')).not.toBeInTheDocument()
      expect(await screen.findByText('0 appartements trouvés')).toBeInTheDocument()
    })

    it('annuler la confirmation ne supprime rien', async () => {
      const fetchMock = mockFetchAppartements([appartementFixture()])
      globalThis.fetch = fetchMock as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /supprimer l'appartement loft bastille/i }))
      await user.click(screen.getByRole('button', { name: 'Annuler' }))

      expect(screen.queryByText(/Cette action est irréversible/)).not.toBeInTheDocument()
      expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/appartements/1'), expect.objectContaining({ method: 'DELETE' }))
    })

    it('affiche le message de blocage du backend et garde la ligne quand la suppression est refusée', async () => {
      globalThis.fetch = mockFetchAppartements([appartementFixture()], {}, {}, {
        1: 'Impossible de supprimer : cet appartement a des séjours actifs ou à venir.',
      }) as typeof fetch
      const user = userEvent.setup()

      render(<AppartementsListeSection onNavigateToCreer={vi.fn()} onEditAppartement={vi.fn()} />)

      await screen.findByText('1 appartements trouvés')
      await user.click(screen.getByRole('button', { name: /supprimer l'appartement loft bastille/i }))
      await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))

      expect(
        await screen.findByText('Impossible de supprimer : cet appartement a des séjours actifs ou à venir.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Confirmer la suppression' })).toBeInTheDocument()
    })
  })
})
