import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionDetailAgent } from './MissionDetailAgent'
import i18n from '../i18n'
import type { ChecklistItem, MissionMenage } from '../types'

const appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: '12 rue de la Roquette',
  statut: 'occupe',
  photo_principale: null,
  agent_habituel_id: null,
}

function checklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 1,
    mission_menage_id: 10,
    libelle: 'Passer l\'aspirateur',
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
    sejour: { id: 1, appartement },
    ...overrides,
  }
}

function mockFetch(mission: MissionMenage) {
  let current = mission

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname

    if (path === `/api/mission-menages/${mission.id}/ouvrir` && method === 'PATCH') {
      current = { ...current, vue: true, statut: current.statut === 'a_faire' ? 'en_cours' : current.statut }
      return new Response(JSON.stringify(current), { status: 200 })
    }

    if (path === `/api/mission-menages/${mission.id}/terminer` && method === 'PATCH') {
      const nonCoche = (current.checklist_items ?? []).some((i) => !i.coche)
      if (nonCoche) {
        return new Response(JSON.stringify({ message: 'Tous les éléments doivent être cochés.' }), { status: 422 })
      }
      current = { ...current, statut: 'en_attente_validation' }
      return new Response(JSON.stringify(current), { status: 200 })
    }

    const checklistMatch = path.match(/^\/api\/checklist-items\/(\d+)$/)
    if (checklistMatch && method === 'POST') {
      const itemId = Number(checklistMatch[1])
      const formData = init?.body as FormData
      const cocheRaw = formData.get('coche')
      const updatedItem = {
        ...(current.checklist_items ?? []).find((i) => i.id === itemId)!,
        coche: cocheRaw != null ? cocheRaw === 'true' : (current.checklist_items ?? []).find((i) => i.id === itemId)!.coche,
        photo_url: formData.get('photo') ? 'checklist-items/preuve.jpg' : (current.checklist_items ?? []).find((i) => i.id === itemId)!.photo_url,
      }
      current = {
        ...current,
        checklist_items: (current.checklist_items ?? []).map((i) => (i.id === itemId ? updatedItem : i)),
      }
      return new Response(JSON.stringify(updatedItem), { status: 200 })
    }

    if (path === `/api/mission-menages/${mission.id}/photos-preuve` && method === 'POST') {
      const formData = init?.body as FormData
      const photos = formData.getAll('photos[]')
      const note = formData.get('note')
      return new Response(
        JSON.stringify(
          photos.map((_, index) => ({
            id: 100 + index,
            mission_menage_id: mission.id,
            photo_url: 'missions-menage-photos-preuve/preuve.jpg',
            note: note || null,
          })),
        ),
        { status: 201 },
      )
    }

    if (path === `/api/mission-menages/${mission.id}/signalements` && method === 'POST') {
      const formData = init?.body as FormData
      return new Response(
        JSON.stringify({
          id: 99,
          appartement_id: appartement.id,
          mission_origine_id: mission.id,
          agent_id: null,
          description: formData.get('description') || null,
          photo_url: formData.get('photo') ? 'tickets-maintenance/photo.jpg' : null,
          audio_url: formData.get('audio') ? 'tickets-maintenance/audio.webm' : null,
          urgence: 'normale',
          statut: 'ouvert',
        }),
        { status: 201 },
      )
    }

    throw new Error(`Unhandled request: ${method} ${path}`)
  })
}

describe('MissionDetailAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    void i18n.changeLanguage('fr')
  })

  it("ouvre la mission au montage (marque vue, passe a_faire à en_cours)", async () => {
    const fetchMock = mockFetch(missionFixture())
    globalThis.fetch = fetchMock as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/mission-menages/10/ouvrir'),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('affiche un avertissement clair quand la mission a été renvoyée (non_conforme)', async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        statut: 'non_conforme',
        refus: [{ id: 1, motif: 'La salle de bain n\'est pas propre.', motif_audio_url: null, motif_photo_url: null, vu: true, created_at: '2026-08-11T10:00:00Z' }],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByText(/renvoyé par le manager/i)).toBeInTheDocument()
  })

  it("n'affiche pas d'avertissement de renvoi pour une mission a_faire normale", async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    expect(screen.queryByText(/renvoyé par le manager/i)).not.toBeInTheDocument()
  })

  it('affiche chaque item de checklist avec une case à cocher', async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByText("Passer l'aspirateur")).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: "Passer l'aspirateur" })).toHaveAttribute('aria-checked', 'false')
  })

  it("affiche le libellé arabe d'un item quand l'agent a choisi l'arabe et qu'il est renseigné", async () => {
    await i18n.changeLanguage('ar')
    globalThis.fetch = mockFetch(
      missionFixture({
        checklist_items: [checklistItem({ libelle: 'Passer l\'aspirateur', libelle_ar: 'تنظيف الأرضية' })],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByText('تنظيف الأرضية')).toBeInTheDocument()
    expect(screen.queryByText("Passer l'aspirateur")).not.toBeInTheDocument()
  })

  it("retombe sur le libellé français quand l'agent a choisi l'arabe mais qu'aucune traduction n'est renseignée", async () => {
    await i18n.changeLanguage('ar')
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByText("Passer l'aspirateur")).toBeInTheDocument()
  })

  it("garde le libellé français d'un item traduit quand l'agent a choisi le français", async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        checklist_items: [checklistItem({ libelle: 'Passer l\'aspirateur', libelle_ar: 'تنظيف الأرضية' })],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByText("Passer l'aspirateur")).toBeInTheDocument()
    expect(screen.queryByText('تنظيف الأرضية')).not.toBeInTheDocument()
  })

  it('affiche la photo de référence d\'un item de checklist quand présente', async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        checklist_items: [checklistItem({ photo_reference_url: 'checklist-modele-items/exemple.jpg' })],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    expect(await screen.findByAltText('Photo de référence pour "Passer l\'aspirateur"')).toBeInTheDocument()
  })

  it('le bouton "Marquer terminé" est désactivé tant que tous les items ne sont pas cochés', async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText("Passer l'aspirateur")
    expect(screen.getByRole('button', { name: /marquer terminé/i })).toBeDisabled()
  })

  it('cocher le seul item active le bouton "Marquer terminé", puis le clic termine la mission', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch
    const onMissionTerminee = vi.fn()

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={onMissionTerminee} />)

    await screen.findByText("Passer l'aspirateur")
    await user.click(screen.getByRole('checkbox', { name: "Passer l'aspirateur" }))

    await waitFor(() => expect(screen.getByRole('button', { name: /marquer terminé/i })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: /marquer terminé/i }))

    await waitFor(() => expect(onMissionTerminee).toHaveBeenCalled())
    expect(await screen.findByText(/envoyé au manager pour validation/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /marquer terminé/i })).not.toBeInTheDocument()
  })

  it('coche l\'item localement même hors ligne, et ne montre aucune erreur', async () => {
    const user = userEvent.setup()
    const baseFetch = mockFetch(missionFixture())
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.match(/^\/api\/checklist-items\/\d+$/)) {
        throw new TypeError('Failed to fetch')
      }
      return baseFetch(input, init)
    })
    globalThis.fetch = fetchMock as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText("Passer l'aspirateur")
    await user.click(screen.getByRole('checkbox', { name: "Passer l'aspirateur" }))

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: "Passer l'aspirateur" })).toHaveAttribute('aria-checked', 'true'),
    )
    expect(screen.queryByText(/hors ligne/i)).not.toBeInTheDocument()
  })

  it('le bouton "Signaler un problème" ouvre le formulaire de signalement', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))

    expect(screen.getByRole('heading', { name: /signaler un problème/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('envoie un signalement avec uniquement une description et affiche une confirmation', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(missionFixture())
    globalThis.fetch = fetchMock as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.type(screen.getByLabelText(/description/i), 'La chasse d\'eau ne fonctionne plus.')
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/mission-menages/10/signalements'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByTestId('signalement-confirmation')).toHaveTextContent(/envoyé au manager/i)
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument()
  })

  it('refuse d\'envoyer un signalement sans photo, audio ni description', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /signaler un problème/i }))
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByText(/ajoutez au moins une photo, un audio ou une description/i)).toBeInTheDocument()
  })

  it('affiche une barre de progression (rôle ARIA) qui reflète les items cochés', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(
      missionFixture({
        checklist_items: [checklistItem({ id: 1, libelle: 'Changer les draps' }), checklistItem({ id: 2, libelle: 'Passer l\'aspirateur' })],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Changer les draps')
    const progressbar = screen.getByRole('progressbar', { name: /progression/i })
    expect(progressbar).toHaveAttribute('aria-valuenow', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '2')

    await user.click(screen.getByRole('checkbox', { name: 'Changer les draps' }))

    await waitFor(() => expect(screen.getByRole('progressbar', { name: /progression/i })).toHaveAttribute('aria-valuenow', '1'))
  })

  it('un item coché devient une zone verte pleine (le changement de couleur est le signal principal)', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    const checkbox = await screen.findByRole('checkbox', { name: "Passer l'aspirateur" })
    expect(checkbox).not.toHaveClass('bg-success')

    await user.click(checkbox)

    await waitFor(() => expect(screen.getByRole('checkbox', { name: "Passer l'aspirateur" })).toHaveClass('bg-success'))
  })

  it('regroupe les items de checklist par modèle d\'origine avec un sous-titre par groupe', async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        checklist_items: [
          checklistItem({ id: 1, libelle: 'Passer l\'aspirateur', checklist_modele_nom: 'Standard' }),
          checklistItem({ id: 2, libelle: 'Changer les draps', checklist_modele_nom: 'Standard' }),
          checklistItem({ id: 3, libelle: 'Laver les vitres', checklist_modele_nom: 'Fenêtres' }),
        ],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText("Passer l'aspirateur")

    const subtitles = screen.getAllByText(/^(Standard|Fenêtres)$/)
    expect(subtitles.map((el) => el.textContent)).toEqual(['Standard', 'Fenêtres'])
    expect(screen.getByText('Changer les draps')).toBeInTheDocument()
    expect(screen.getByText('Laver les vitres')).toBeInTheDocument()
  })

  it('n\'affiche aucun sous-titre quand les items n\'ont pas de modèle d\'origine', async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText("Passer l'aspirateur")

    expect(screen.queryByText('Standard')).not.toBeInTheDocument()
  })

  it('affiche "Ajouter une photo de mon travail", distinct de "Signaler un problème"', async () => {
    globalThis.fetch = mockFetch(missionFixture()) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    expect(screen.getByRole('button', { name: /ajouter une photo de mon travail/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /signaler un problème/i })).toBeInTheDocument()
  })

  it('met en avant "Ajouter une photo de mon travail" (déplié, message dédié) quand la mission est non_conforme', async () => {
    globalThis.fetch = mockFetch(
      missionFixture({
        statut: 'non_conforme',
        refus: [{ id: 1, motif: 'La salle de bain n\'est pas propre.', motif_audio_url: null, motif_photo_url: null, vu: true, created_at: '2026-08-11T10:00:00Z' }],
      }),
    ) as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    // misEnAvant auto-expands the form (rather than showing the collapsed
    // big blue button), so its heading is visible immediately.
    expect(screen.getByRole('heading', { name: /ajouter une photo de mon travail/i })).toBeInTheDocument()
  })

  it('envoie une photo de preuve de travail (flux indépendant du signalement de problème)', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch(missionFixture())
    globalThis.fetch = fetchMock as typeof fetch

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={vi.fn()} />)

    await screen.findByText('Loft Bastille')
    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    const photo = new File(['contenu'], 'travail.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), photo)
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/mission-menages/10/photos-preuve'),
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByTestId('photo-preuve-confirmation')).toBeInTheDocument()
  })

  it('permet de marquer terminé une mission sans aucun item de checklist', async () => {
    const user = userEvent.setup()
    globalThis.fetch = mockFetch(missionFixture({ checklist_items: [] })) as typeof fetch
    const onMissionTerminee = vi.fn()

    render(<MissionDetailAgent missionId={10} catalogue={[]} onBack={vi.fn()} onMissionTerminee={onMissionTerminee} />)

    await screen.findByText('Loft Bastille')
    expect(screen.getByRole('button', { name: /marquer terminé/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /marquer terminé/i }))

    await waitFor(() => expect(onMissionTerminee).toHaveBeenCalled())
    expect(await screen.findByText(/envoyé au manager pour validation/i)).toBeInTheDocument()
  })
})
