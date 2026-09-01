import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RelevesProprietairesSection } from './RelevesProprietairesSection'
import type { Appartement, Releve } from '../types'

function appartementFixture(overrides: Partial<Appartement> = {}): Appartement {
  return {
    id: 1,
    nom: 'Loft Bastille',
    adresse: '12 rue de la Roquette',
    statut: 'disponible',
    photo_principale: null,
    agent_habituel_id: null,
    proprietaire: { id: 5, nom: 'Karim Alaoui', telephone: null, email: null, adresse: null },
    ...overrides,
  }
}

function releveFixture(overrides: Partial<Releve> = {}): Releve {
  return {
    appartement: {
      id: 1,
      nom: 'Loft Bastille',
      adresse: '12 rue de la Roquette',
      mode_gestion: 'mandat',
      taux_commission: 20,
      loyer_fixe_mensuel: null,
      proprietaire: { id: 5, nom: 'Karim Alaoui', telephone: null, email: null, adresse: null },
    },
    mois: '2026-08',
    revenus_bruts: 1000,
    frais_menage_total: 100,
    frais_maintenance_total: 50,
    charges_restinnov_total: 0,
    charges_proprietaire_total: 0,
    resultat_net: 850,
    montant_proprietaire: 680,
    commission_restinnov: 170,
    sejours: [],
    frais_menage_detail: [],
    frais_maintenance_detail: [],
    charges_detail: [],
    verrouille: false,
    verrouille_le: null,
    comparaison_mois_precedent: { mois: '2026-07', resultat_net: 850, variation_pct: 0 },
    ...overrides,
  }
}

function mockFetch(appartements: Appartement[], releves: Record<number, Releve>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'

    if (url.pathname === '/api/appartements' && !url.pathname.includes('releve')) {
      return new Response(JSON.stringify(appartements), { status: 200 })
    }

    const releveMatch = url.pathname.match(/^\/api\/appartements\/(\d+)\/releve$/)
    if (releveMatch) {
      const id = Number(releveMatch[1])
      releves[id] ??= releveFixture({ appartement: { ...releveFixture().appartement, id } })
      return new Response(JSON.stringify(releves[id]), { status: 200 })
    }

    const pdfMatch = url.pathname.match(/^\/api\/appartements\/(\d+)\/releve\/pdf$/)
    if (pdfMatch) {
      return new Response('%PDF-1.4 fake', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      })
    }

    const proprietaireMatch = url.pathname.match(/^\/api\/proprietaires\/(\d+)$/)
    if (proprietaireMatch && method === 'PATCH') {
      const body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ id: Number(proprietaireMatch[1]), ...body }), { status: 200 })
    }

    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('RelevesProprietairesSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche le tableau avec appartement, propriétaire, mode, revenus, frais et montant dû', async () => {
    globalThis.fetch = mockFetch([appartementFixture()], { 1: releveFixture() }) as typeof fetch

    render(<RelevesProprietairesSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('Karim Alaoui')).toBeInTheDocument()
    expect(screen.getByText('MANDAT')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByText('1000.00 MAD')).toBeInTheDocument()
    expect(within(table).getByText('150.00 MAD')).toBeInTheDocument() // 100 menage + 50 maintenance
    expect(within(table).getByText('680.00 MAD')).toBeInTheDocument()
  })

  it('affiche un badge cadenas pour un mois déjà verrouillé', async () => {
    globalThis.fetch = mockFetch([appartementFixture()], { 1: releveFixture({ verrouille: true }) }) as typeof fetch

    render(<RelevesProprietairesSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /mois déjà facturé au propriétaire/i })).toBeInTheDocument()
  })

  it("n'affiche aucun badge cadenas pour un mois non verrouillé", async () => {
    globalThis.fetch = mockFetch([appartementFixture()], { 1: releveFixture({ verrouille: false }) }) as typeof fetch

    render(<RelevesProprietairesSection />)

    expect(await screen.findByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /mois déjà facturé au propriétaire/i })).not.toBeInTheDocument()
  })

  it('inclut les charges à la charge de RestInnov dans la colonne Frais', async () => {
    globalThis.fetch = mockFetch(
      [appartementFixture()],
      { 1: releveFixture({ charges_restinnov_total: 149 }) },
    ) as typeof fetch

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    const table = screen.getByRole('table')
    // 100 menage + 50 maintenance + 149 charges restinnov
    expect(within(table).getByText('299.00 MAD')).toBeInTheDocument()
  })

  it('affiche les 3 KPI (revenus bruts, reversé aux propriétaires, commission Restinnov)', async () => {
    globalThis.fetch = mockFetch([appartementFixture()], { 1: releveFixture() }) as typeof fetch

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    expect(screen.getByText('Revenus bruts')).toBeInTheDocument()
    expect(screen.getByText('Reversé aux propriétaires')).toBeInTheDocument()
    expect(screen.getByText('Commission Restinnov')).toBeInTheDocument()
    expect(screen.getByText('170.00 MAD')).toBeInTheDocument()
  })

  it('le bouton "Générer tous les PDF" télécharge le relevé de chaque appartement', async () => {
    const fetchMock = mockFetch(
      [appartementFixture({ id: 1 }), appartementFixture({ id: 2, nom: 'Zenith' })],
      { 1: releveFixture(), 2: releveFixture({ appartement: { ...releveFixture().appartement, id: 2 } }) },
    )
    globalThis.fetch = fetchMock as typeof fetch
    const user = userEvent.setup()

    URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    URL.revokeObjectURL = vi.fn()

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    await user.click(screen.getByRole('button', { name: /générer tous les pdf/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/appartements/1/releve/pdf?mois='), expect.anything()),
    )
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/appartements/2/releve/pdf?mois='), expect.anything()),
    )
  })

  it('affiche un message quand il n\'y a aucun appartement', async () => {
    globalThis.fetch = mockFetch([], {}) as typeof fetch

    render(<RelevesProprietairesSection />)

    expect(await screen.findByText('Aucun appartement pour le moment.')).toBeInTheDocument()
  })

  it('recharge les relevés quand le mois change', async () => {
    const fetchMock = mockFetch([appartementFixture()], { 1: releveFixture() })
    globalThis.fetch = fetchMock as typeof fetch
    const user = userEvent.setup()

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    const monthInput = screen.getByLabelText('Mois')
    await user.clear(monthInput)
    await user.type(monthInput, '2026-09')

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/appartements/1/releve?mois=2026-09'),
        expect.anything(),
      ),
    )
  })

  it('le bouton "Télécharger PDF" déclenche le téléchargement du relevé', async () => {
    const fetchMock = mockFetch([appartementFixture()], { 1: releveFixture() })
    globalThis.fetch = fetchMock as typeof fetch
    const user = userEvent.setup()

    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    await user.click(screen.getByRole('button', { name: /télécharger pdf/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/appartements/1/releve/pdf?mois='), expect.anything()),
    )
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
  })

  it('modifie les coordonnées du propriétaire via la modal "Propriétaire"', async () => {
    globalThis.fetch = mockFetch([appartementFixture()], { 1: releveFixture() }) as typeof fetch
    const user = userEvent.setup()

    render(<RelevesProprietairesSection />)
    await screen.findByText('Loft Bastille')

    await user.click(screen.getByRole('button', { name: 'Propriétaire' }))
    expect(screen.getByText('Modifier le propriétaire')).toBeInTheDocument()

    const telephoneInput = screen.getByLabelText('Téléphone')
    await user.clear(telephoneInput)
    await user.type(telephoneInput, '0600000000')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.queryByText('Modifier le propriétaire')).not.toBeInTheDocument())
  })
})
