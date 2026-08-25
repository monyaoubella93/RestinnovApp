import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MissionValidationDetail } from './MissionValidationDetail'
import type { MissionMenage } from '../types'

function missionFixture(overrides: Partial<MissionMenage> = {}): MissionMenage {
  return {
    id: 10,
    sejour_id: 1,
    agent_id: 5,
    statut: 'en_attente_validation',
    agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
    frais_forfait: 0,
    vue: true,
    checklist_items: [],
    produits_signales: [],
    ...overrides,
  }
}

describe('MissionValidationDetail', () => {
  it('le détail est masqué par défaut, "Voir le détail" le déplie', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          checklist_items: [{ id: 1, mission_menage_id: 10, libelle: 'Changer les draps', coche: true, photo_url: null, photo_reference_url: null, ordre: 0 }],
        })}
      />,
    )

    expect(screen.queryByText('Changer les draps')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Changer les draps')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /masquer le détail/i })).toBeInTheDocument()
  })

  it('distingue visuellement (aria-label) les items cochés des non cochés', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          checklist_items: [
            { id: 1, mission_menage_id: 10, libelle: 'Changer les draps', coche: true, photo_url: null, photo_reference_url: null, ordre: 0 },
            { id: 2, mission_menage_id: 10, libelle: 'Passer l\'aspirateur', coche: false, photo_url: null, photo_reference_url: null, ordre: 1 },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByLabelText('Coché')).toBeInTheDocument()
    expect(screen.getByLabelText('Non coché')).toBeInTheDocument()
  })

  it('affiche la miniature photo d\'un item de checklist quand présente', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          checklist_items: [
            {
              id: 1,
              mission_menage_id: 10,
              libelle: 'Changer les draps',
              coche: true,
              photo_url: 'checklist-items/preuve.jpg',
              photo_reference_url: null,
              ordre: 0,
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    const image = screen.getByAltText('Photo de "Changer les draps"')
    expect(image).toHaveAttribute('src', expect.stringContaining('checklist-items/preuve.jpg'))
  })

  it('affiche les produits signalés avec photo, note et statut', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          produits_signales: [
            {
              id: 1,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
              note: 'Nouveau produit trouvé',
              statut: 'en_attente',
              produit_catalogue_id: null,
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Nouveau produit trouvé')).toBeInTheDocument()
    expect(screen.getByText('En attente')).toBeInTheDocument()
    const image = screen.getByAltText('Photo du produit signalé')
    expect(image).toHaveAttribute('src', expect.stringContaining('produits-signales/photo.jpg'))
  })

  it('affiche un message "aucun" pour la checklist vide, et n\'affiche aucune section produits signalés quand il n\'y en a pas', async () => {
    const user = userEvent.setup()
    render(<MissionValidationDetail mission={missionFixture()} />)

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Aucun item de checklist.')).toBeInTheDocument()
    expect(screen.queryByText(/produits signalés/i)).not.toBeInTheDocument()
  })

  it('n\'affiche pas la section produits signalés quand tous les produits signalés sont déjà traités', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          produits_signales: [
            {
              id: 4,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
              note: 'Déjà traité',
              statut: 'valide',
              produit_catalogue_id: 1,
            },
          ],
        })}
        onValiderProduitSignale={vi.fn()}
        onRejeterProduitSignale={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.queryByText(/produits signalés/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Déjà traité')).not.toBeInTheDocument()
  })

  it('permet de valider/rejeter un produit "en_attente" directement, sans quitter l\'écran, quand les callbacks sont fournis', async () => {
    const user = userEvent.setup()
    const onValiderProduitSignale = vi.fn().mockResolvedValue(undefined)
    const onRejeterProduitSignale = vi.fn().mockResolvedValue(undefined)

    render(
      <MissionValidationDetail
        mission={missionFixture({
          produits_signales: [
            {
              id: 3,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
              note: 'Trouvé sur place',
              statut: 'en_attente',
              produit_catalogue_id: null,
            },
          ],
        })}
        onValiderProduitSignale={onValiderProduitSignale}
        onRejeterProduitSignale={onRejeterProduitSignale}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))
    await user.type(screen.getByLabelText('Nom'), 'Gel douche')
    await user.type(screen.getByLabelText('Prix (MAD)'), '30')
    await user.click(screen.getByRole('button', { name: /^valider$/i }))

    expect(onValiderProduitSignale).toHaveBeenCalledWith(3, { nom: 'Gel douche', prix: 30 })

    await user.click(screen.getByRole('button', { name: /^rejeter$/i }))
    expect(onRejeterProduitSignale).toHaveBeenCalledWith(3)
  })

  it('un produit disparaît de la section dès qu\'il est validé (sans quitter l\'écran)', async () => {
    const user = userEvent.setup()
    const onValiderProduitSignale = vi.fn().mockResolvedValue(undefined)

    const { rerender } = render(
      <MissionValidationDetail
        mission={missionFixture({
          produits_signales: [
            {
              id: 3,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
              note: 'Trouvé sur place',
              statut: 'en_attente',
              produit_catalogue_id: null,
            },
          ],
        })}
        onValiderProduitSignale={onValiderProduitSignale}
        onRejeterProduitSignale={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))
    expect(screen.getByText(/trouvé sur place/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nom'), 'Gel douche')
    await user.type(screen.getByLabelText('Prix (MAD)'), '30')
    await user.click(screen.getByRole('button', { name: /^valider$/i }))
    expect(onValiderProduitSignale).toHaveBeenCalledWith(3, { nom: 'Gel douche', prix: 30 })

    // The parent re-renders with the product now "valide" -- it must
    // disappear from this section rather than linger read-only.
    rerender(
      <MissionValidationDetail
        mission={missionFixture({
          produits_signales: [
            {
              id: 3,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
              note: 'Trouvé sur place',
              statut: 'valide',
              produit_catalogue_id: 1,
            },
          ],
        })}
        onValiderProduitSignale={onValiderProduitSignale}
        onRejeterProduitSignale={vi.fn()}
      />,
    )

    expect(screen.queryByText(/trouvé sur place/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/produits signalés/i)).not.toBeInTheDocument()
  })

  it('affiche les photos de preuve du travail de l\'agent', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          photos_preuve: [
            { id: 1, mission_menage_id: 10, photo_url: 'missions-menage-photos-preuve/preuve.jpg', note: 'Corrigé', created_at: '2026-08-17T10:00:00Z' },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Photos de preuve du travail')).toBeInTheDocument()
    const image = screen.getByAltText('Photo de preuve du travail')
    expect(image).toHaveAttribute('src', expect.stringContaining('missions-menage-photos-preuve/preuve.jpg'))
    expect(screen.getByText('Corrigé')).toBeInTheDocument()
  })

  it('agrandit une photo de preuve du travail au clic, et la referme', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          photos_preuve: [
            { id: 1, mission_menage_id: 10, photo_url: 'missions-menage-photos-preuve/preuve.jpg', note: null, created_at: '2026-08-17T10:00:00Z' },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))
    await user.click(screen.getByRole('button', { name: /agrandir la photo de preuve du travail/i }))

    const dialog = screen.getByRole('dialog')
    const enlarged = within(dialog).getAllByAltText('Photo de preuve du travail')[0]
    expect(enlarged).toHaveAttribute('src', expect.stringContaining('missions-menage-photos-preuve/preuve.jpg'))

    await user.click(screen.getByRole('button', { name: /fermer l'aperçu/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('agrandit la photo d\'un item de checklist au clic', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          checklist_items: [
            {
              id: 1,
              mission_menage_id: 10,
              libelle: 'Changer les draps',
              coche: true,
              photo_url: 'checklist-items/preuve.jpg',
              photo_reference_url: null,
              ordre: 0,
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))
    await user.click(screen.getByRole('button', { name: /agrandir la photo de "changer les draps"/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByAltText('Photo de "Changer les draps"').length).toBeGreaterThan(0)
  })

  it('distingue un produit "stock existant" (badge gris, pas de prix) d\'un produit "racheté" (photo + prix réel)', async () => {
    const user = userEvent.setup()
    render(
      <MissionValidationDetail
        mission={missionFixture({
          produits: [
            {
              id: 1,
              nom: 'Javel',
              prix: '3.00',
              photo_url: null,
              actif: true,
              pivot: { type_utilisation: 'stock_existant', photo_url: null, prix_paye: null },
            },
            {
              id: 2,
              nom: 'Sac poubelle',
              prix: '2.00',
              photo_url: null,
              actif: true,
              pivot: { type_utilisation: 'rachete', photo_url: 'mission-menage-produits/preuve.jpg', prix_paye: 15 },
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Produits utilisés')).toBeInTheDocument()
    expect(screen.getByText('Javel')).toBeInTheDocument()
    expect(screen.getByText('Déjà présent')).toBeInTheDocument()

    expect(screen.getByText('Sac poubelle')).toBeInTheDocument()
    expect(screen.getByText(/racheté · 15\.00 mad/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /agrandir la photo preuve d'achat de "sac poubelle"/i }),
    ).toBeInTheDocument()
  })

  it('n\'affiche pas la section "Produits utilisés" quand aucun produit n\'a été coché', async () => {
    const user = userEvent.setup()
    render(<MissionValidationDetail mission={missionFixture({ produits: [] })} />)

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.queryByText('Produits utilisés')).not.toBeInTheDocument()
  })
})
