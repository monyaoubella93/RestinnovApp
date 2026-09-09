import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionCalendrierConformeDetail } from './MissionCalendrierConformeDetail'
import type { ChecklistItem, MissionMenage } from '../types'

const appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: '12 rue de la Roquette',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

function checklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 1,
    mission_menage_id: 20,
    libelle: "Passer l'aspirateur",
    libelle_ar: null,
    coche: true,
    photo_url: null,
    photo_reference_url: null,
    ordre: 0,
    ...overrides,
  }
}

function missionFixture(overrides: Partial<MissionMenage> = {}): MissionMenage {
  return {
    id: 20,
    sejour_id: 1,
    agent_id: 1,
    statut: 'conforme',
    agent: { id: 1, nom: 'Fatima Z.', role: 'menage', telephone: null },
    frais_forfait: 0,
    vue: true,
    produits: [],
    checklist_items: [checklistItem()],
    photos_preuve: [],
    sejour: { id: 1, appartement },
    ...overrides,
  }
}

function mockFetch(mission: MissionMenage) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname === `/api/mission-menages/${mission.id}`) {
      return new Response(JSON.stringify(mission), { status: 200 })
    }
    throw new Error(`Unhandled request: ${url.pathname}`)
  })
}

describe('MissionCalendrierConformeDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("affiche l'appartement, le badge validée, et la checklist en lecture seule", async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionCalendrierConformeDetail missionId={20} onBack={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Loft Bastille' })).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Roquette')).toBeInTheDocument()
    expect(screen.getByText('Mission validée')).toBeInTheDocument()
    expect(screen.getByText("Passer l'aspirateur")).toBeInTheDocument()
  })

  it("n'affiche aucun bouton d'action mutante (pas de case à cocher, pas de bouton terminer)", async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionCalendrierConformeDetail missionId={20} onBack={vi.fn()} />)

    await screen.findByText("Passer l'aspirateur")

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /marquer terminé/i })).not.toBeInTheDocument()
  })

  it('affiche les produits utilisés', async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        produits: [
          {
            id: 1,
            nom: 'Éponge',
            nom_ar: null,
            prix: 10,
            photo_url: null,
            actif: true,
            pivot: { type_utilisation: 'stock_existant', photo_url: null, prix_paye: null },
          },
        ],
      }),
    ) as typeof fetch

    render(<MissionCalendrierConformeDetail missionId={20} onBack={vi.fn()} />)

    expect(await screen.findByText('Éponge')).toBeInTheDocument()
  })

  it('le bouton retour appelle onBack', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionCalendrierConformeDetail missionId={20} onBack={onBack} />)

    await screen.findByText("Passer l'aspirateur")
    await user.click(screen.getByText('← Retour à mes missions'))

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
