import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendrierSection } from './CalendrierSection'
import type { Appartement, CalendrierData, CalendrierSejour } from '../types'

const appartementA: Appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: '12 rue de la Roquette',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

const appartementB: Appartement = {
  id: 2,
  nom: 'Studio Marais',
  adresse: '5 rue des Rosiers',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

function sejour(overrides: Partial<CalendrierSejour> = {}): CalendrierSejour {
  return {
    id: 1,
    reference: 'SEJ-0001',
    nom_voyageur: 'Jean Dupont',
    statut: 'a_venir',
    appartement: { id: 1, nom: 'Loft Bastille' },
    ...overrides,
  }
}

function daysInMonth(mois: string): number {
  const [year, month] = mois.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

function buildCalendrierData(mois: string, sejoursByDate: Record<string, CalendrierSejour[]> = {}): CalendrierData {
  const jours = Array.from({ length: daysInMonth(mois) }, (_, i) => {
    const date = `${mois}-${String(i + 1).padStart(2, '0')}`
    return { date, sejours: sejoursByDate[date] ?? [] }
  })
  return { mois, jours }
}

function mockFetch(dataByMois: Record<string, CalendrierData>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/calendrier') {
      const mois = url.searchParams.get('mois')!
      const appartementId = url.searchParams.get('appartement_id')
      let data = dataByMois[mois] ?? buildCalendrierData(mois)
      if (appartementId) {
        data = {
          ...data,
          jours: data.jours.map((jour) => ({
            ...jour,
            sejours: jour.sejours.filter((s) => String(s.appartement?.id) === appartementId),
          })),
        }
      }
      return new Response(JSON.stringify(data), { status: 200 })
    }
    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('CalendrierSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-15T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche le mois courant avec les jours occupés colorés selon leur statut', async () => {
    const data = buildCalendrierData('2026-08', {
      '2026-08-10': [sejour({ id: 1, statut: 'a_venir' })],
      '2026-08-11': [sejour({ id: 2, statut: 'en_cours' })],
      '2026-08-12': [sejour({ id: 3, statut: 'termine' })],
    })
    globalThis.fetch = mockFetch({ '2026-08': data }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA, appartementB]} onNavigateToSejour={vi.fn()} />)

    expect(await screen.findByText('Août 2026')).toBeInTheDocument()

    const jour10 = await screen.findByRole('button', { name: /2026-08-10 : 1 séjour/i })
    const jour11 = screen.getByRole('button', { name: /2026-08-11 : 1 séjour/i })
    const jour12 = screen.getByRole('button', { name: /2026-08-12 : 1 séjour/i })

    expect(jour10.className).toContain('bg-brand-pale')
    expect(jour11.className).toContain('bg-warning-bg')
    expect(jour12.className).toContain('bg-success-bg')
  })

  it('affiche un badge avec le nombre de séjours quand plusieurs appartements sont occupés le même jour', async () => {
    const data = buildCalendrierData('2026-08', {
      '2026-08-10': [
        sejour({ id: 1, appartement: { id: 1, nom: 'Loft Bastille' } }),
        sejour({ id: 2, appartement: { id: 2, nom: 'Studio Marais' } }),
        sejour({ id: 3, appartement: { id: 3, nom: 'Duplex Bréguet' } }),
      ],
    })
    globalThis.fetch = mockFetch({ '2026-08': data }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA, appartementB]} onNavigateToSejour={vi.fn()} />)

    expect(await screen.findByTestId('jour-badge-2026-08-10')).toHaveTextContent('3')
  })

  it("n'affiche aucune couleur ni badge pour un jour libre", async () => {
    globalThis.fetch = mockFetch({ '2026-08': buildCalendrierData('2026-08') }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA]} onNavigateToSejour={vi.fn()} />)

    const jour5 = await screen.findByRole('button', { name: '2026-08-05' })
    expect(jour5).toBeDisabled()
    expect(jour5.className).not.toContain('bg-brand-pale')
    expect(jour5.className).not.toContain('bg-warning-bg')
    expect(jour5.className).not.toContain('bg-success-bg')
  })

  it('navigue au mois précédent et suivant', async () => {
    const user = userEvent.setup({ delay: null })
    globalThis.fetch = mockFetch({
      '2026-07': buildCalendrierData('2026-07'),
      '2026-08': buildCalendrierData('2026-08'),
      '2026-09': buildCalendrierData('2026-09'),
    }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA]} onNavigateToSejour={vi.fn()} />)

    expect(await screen.findByText('Août 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mois précédent/i }))
    expect(await screen.findByText('Juillet 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mois suivant/i }))
    await user.click(screen.getByRole('button', { name: /mois suivant/i }))
    expect(await screen.findByText('Septembre 2026')).toBeInTheDocument()
  })

  it("filtre par appartement et exclut les séjours des autres biens", async () => {
    const user = userEvent.setup({ delay: null })
    const data = buildCalendrierData('2026-08', {
      '2026-08-10': [
        sejour({ id: 1, appartement: { id: 1, nom: 'Loft Bastille' } }),
        sejour({ id: 2, appartement: { id: 2, nom: 'Studio Marais' } }),
      ],
    })
    globalThis.fetch = mockFetch({ '2026-08': data }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA, appartementB]} onNavigateToSejour={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /2026-08-10 : 2 séjours/i })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/appartement/i), '1')

    expect(await screen.findByRole('button', { name: /2026-08-10 : 1 séjour\b/i })).toBeInTheDocument()
  })

  it('ouvre le détail du jour au clic et navigue vers le séjour sélectionné', async () => {
    const user = userEvent.setup({ delay: null })
    const onNavigateToSejour = vi.fn()
    const data = buildCalendrierData('2026-08', {
      '2026-08-10': [sejour({ id: 42, nom_voyageur: 'Marie Curie', reference: 'SEJ-0042' })],
    })
    globalThis.fetch = mockFetch({ '2026-08': data }) as typeof fetch

    render(<CalendrierSection appartements={[appartementA]} onNavigateToSejour={onNavigateToSejour} />)

    await user.click(await screen.findByRole('button', { name: /2026-08-10 : 1 séjour/i }))

    expect(await screen.findByText('Marie Curie')).toBeInTheDocument()
    expect(screen.getByText(/SEJ-0042/)).toBeInTheDocument()

    await user.click(screen.getByText('Marie Curie'))

    expect(onNavigateToSejour).toHaveBeenCalledWith(42)
  })
})
