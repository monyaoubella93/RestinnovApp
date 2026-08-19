import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MesMissionsSection } from './MesMissionsSection'
import type { MissionMenage } from '../types'

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
    checklist_items: [],
    sejour: {
      id: 1,
      appartement: {
        id: 1,
        nom: 'Loft Bastille',
        adresse: '12 rue de la Roquette',
        statut: 'occupe',
        photo_principale: null,
        agent_habituel_id: null,
      },
    },
    ...overrides,
  }
}

function renderSection(overrides: Partial<ComponentProps<typeof MesMissionsSection>> = {}) {
  return render(
    <MesMissionsSection
      missions={[]}
      catalogue={[]}
      loading={false}
      error={null}
      emptyIcon="✅"
      emptyMessage="Aucune mission pour l'instant."
      onRefresh={vi.fn()}
      {...overrides}
    />,
  )
}

describe('MesMissionsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('affiche les missions passées en props', () => {
    renderSection({ missions: [missionFixture({ id: 10, vue: false })] })

    expect(screen.getByText('Loft Bastille')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByTestId('mission-nouvelle-badge-10')).toBeInTheDocument()
  })

  it('n\'affiche pas le badge "Nouveau" pour une mission déjà vue', () => {
    renderSection({ missions: [missionFixture({ id: 10, vue: true })] })

    expect(screen.queryByTestId('mission-nouvelle-badge-10')).not.toBeInTheDocument()
  })

  it('affiche un badge violet "En attente de validation" pour une mission en_attente_validation', () => {
    renderSection({ missions: [missionFixture({ statut: 'en_attente_validation' })] })

    const badge = screen.getByText('En attente de validation')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-violet-bg', 'text-violet')
  })

  it('affiche un badge rouge "Refusé" pour une mission non_conforme', () => {
    renderSection({ missions: [missionFixture({ statut: 'non_conforme' })] })

    const badge = screen.getByText('Refusé')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-danger-bg', 'text-danger')
  })

  it("n'affiche aucun badge de statut pour une mission a_faire ou en_cours", () => {
    renderSection({ missions: [missionFixture({ statut: 'a_faire' })] })

    expect(screen.queryByText(/en attente de validation/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/refusé/i)).not.toBeInTheDocument()
  })

  it("affiche le message vide quand la liste de missions est vide", () => {
    renderSection({ missions: [] })

    expect(screen.getByText(/aucune mission/i)).toBeInTheDocument()
  })

  it('le badge "Nouveau" est un indicateur visuel (rôle status), pas juste du texte à lire', () => {
    renderSection({ missions: [missionFixture({ id: 10, vue: false })] })

    expect(screen.getByRole('status', { name: /nouvelle mission/i })).toBeInTheDocument()
  })

  it("affiche une vignette photo de l'appartement quand une photo existe", () => {
    renderSection({
      missions: [
        missionFixture({
          sejour: {
            id: 1,
            appartement: {
              id: 1,
              nom: 'Loft Bastille',
              adresse: '12 rue de la Roquette',
              statut: 'occupe',
              photo_principale: 'appartements/loft.jpg',
              agent_habituel_id: null,
            },
          },
        }),
      ],
    })

    const image = screen.getByTestId('appartement-photo-10')
    expect(image).toHaveAttribute('src', expect.stringContaining('appartements/loft.jpg'))
  })

  it('affiche le titre et sous-titre passés en props', () => {
    renderSection({ heading: 'Mes missions du jour', subheading: 'Fatima Z.' })

    expect(screen.getByText('Mes missions du jour')).toBeInTheDocument()
    expect(screen.getByText('Fatima Z.')).toBeInTheDocument()
  })

  it('reste sur le détail de la mission (au lieu de revenir à la liste) après "Marquer terminé"', async () => {
    const user = userEvent.setup()

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'

      if (url.pathname === '/api/mission-menages/10/ouvrir' && method === 'PATCH') {
        return new Response(JSON.stringify(missionFixture({ statut: 'en_cours', vue: true })), { status: 200 })
      }

      if (url.pathname === '/api/mission-menages/10/terminer' && method === 'PATCH') {
        return new Response(JSON.stringify(missionFixture({ statut: 'en_attente_validation' })), { status: 200 })
      }

      throw new Error(`Unhandled request: ${method} ${url.pathname}`)
    }) as typeof fetch

    renderSection({ missions: [missionFixture({ statut: 'a_faire' })] })

    await user.click(await screen.findByText('Loft Bastille'))
    await screen.findByText('Checklist')

    const boutonTerminer = await screen.findByRole('button', { name: /marquer terminé/i })
    await user.click(boutonTerminer)

    expect(await screen.findByText(/envoyé au manager pour validation/i)).toBeInTheDocument()
    // Still on the detail view -- "Retour à mes missions" only appears there.
    expect(screen.getByRole('button', { name: /retour à mes missions/i })).toBeInTheDocument()
  })
})
