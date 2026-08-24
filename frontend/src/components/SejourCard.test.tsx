import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SejourCard } from './SejourCard'
import type { Sejour } from '../types'

const appartement = {
  id: 1,
  nom: 'Loft Bastille',
  adresse: 'A',
  statut: 'disponible',
  photo_principale: null,
  agent_habituel_id: null,
}

function sejourFixture(overrides: Partial<Sejour> = {}): Sejour {
  return {
    id: 1,
    reference: 'SEJ-0001',
    appartement_id: 1,
    date_arrivee: '2026-08-01',
    date_depart: '2026-08-05',
    nom_voyageur: 'Jean Dupont',
    statut: 'termine',
    plateforme_origine: 'airbnb',
    montant_mad: 1000,
    appartement,
    voyageurs: [],
    ...overrides,
  }
}

const noop = vi.fn().mockResolvedValue(undefined)

function renderCard(sejour: Sejour, overrides: Partial<ComponentProps<typeof SejourCard>> = {}) {
  return render(
    <SejourCard
      sejour={sejour}
      catalogue={[]}
      onCheckout={noop}
      onValiderMission={noop}
      onRefuserMission={noop}
      onUpdateMissionProduits={noop}
      onUpdateProduitUtilise={noop}
      onDetacherProduit={noop}
      onSignalerProduit={noop}
      onValiderProduitSignale={noop}
      onRejeterProduitSignale={noop}
      onAddFraisMaintenance={noop}
      onDeleteFraisMaintenance={noop}
      {...overrides}
    />,
  )
}

describe('SejourCard', () => {
  it('affiche la référence du séjour', () => {
    renderCard(sejourFixture({ reference: 'SEJ-0042' }))
    expect(screen.getByTestId('sejour-reference')).toHaveTextContent('SEJ-0042')
  })

  it('affiche le badge "Nouveau" quand la mission n\'a pas encore été vue par l\'agent', () => {
    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'a_faire',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: false,
          produits: [],
        },
      }),
    )

    expect(screen.getByTestId('mission-nouvelle-badge')).toBeInTheDocument()
  })

  it('n\'affiche pas le badge quand la mission a déjà été vue', () => {
    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'a_faire',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: true,
          produits: [],
        },
      }),
    )

    expect(screen.queryByTestId('mission-nouvelle-badge')).not.toBeInTheDocument()
  })

  it('affiche "Valider" quand la mission est en_attente_validation, et l\'appelle au clic', async () => {
    const user = userEvent.setup()
    const onValiderMission = vi.fn().mockResolvedValue(undefined)

    render(
      <SejourCard
        sejour={sejourFixture({
          mission_menage: {
            id: 10,
            sejour_id: 1,
            agent_id: 5,
            statut: 'en_attente_validation',
            agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
            frais_forfait: 0,
            vue: true,
            produits: [],
          },
        })}
        catalogue={[]}
        onCheckout={noop}
        onValiderMission={onValiderMission}
        onRefuserMission={noop}
        onUpdateMissionProduits={noop}
        onUpdateProduitUtilise={noop}
        onDetacherProduit={noop}
        onSignalerProduit={noop}
        onValiderProduitSignale={noop}
        onRejeterProduitSignale={noop}
        onAddFraisMaintenance={noop}
        onDeleteFraisMaintenance={noop}
      />,
    )

    expect(screen.getByText('En attente de validation')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /valider/i }))

    expect(onValiderMission).toHaveBeenCalledWith(10)
  })

  it('affiche le panneau de détail (checklist + produits signalés) à côté de "Valider"', async () => {
    const user = userEvent.setup()

    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'en_attente_validation',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: true,
          produits: [],
          checklist_items: [
            { id: 1, mission_menage_id: 10, libelle: 'Changer les draps', coche: true, photo_url: null, photo_reference_url: null, ordre: 0 },
          ],
          produits_signales: [
            {
              id: 1,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              note: 'Nouveau produit',
              statut: 'en_attente',
              produit_catalogue_id: null,
            },
          ],
        },
      }),
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    expect(screen.getByText('Changer les draps')).toBeInTheDocument()
    expect(screen.getByText('Note : Nouveau produit')).toBeInTheDocument()
    // Two "Valider" buttons once expanded: the mission-level one and the
    // inline produit-signalé one now embedded in the detail panel.
    expect(screen.getAllByRole('button', { name: /^valider$/i })).toHaveLength(2)
  })

  it('permet de valider un produit signalé directement depuis l\'écran de validation de la mission', async () => {
    const user = userEvent.setup()
    const onValiderProduitSignale = vi.fn().mockResolvedValue(undefined)

    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'en_attente_validation',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: true,
          produits: [],
          produits_signales: [
            {
              id: 7,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              note: 'Nouveau produit',
              statut: 'en_attente',
              produit_catalogue_id: null,
            },
          ],
        },
      }),
      { onValiderProduitSignale },
    )

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))
    await user.type(screen.getByLabelText('Nom'), 'Savon')
    await user.type(screen.getByLabelText('Prix (MAD)'), '25')
    // The inline produit-signalé card renders inside the detail panel, above
    // the mission-level Valider/Refuser buttons -- so it's the first match.
    await user.click(screen.getAllByRole('button', { name: /^valider$/i })[0])

    expect(onValiderProduitSignale).toHaveBeenCalledWith(7, { nom: 'Savon', prix: 25 })
  })

  it('affiche une mission non_conforme comme refusée, avec son historique de refus, au Manager', () => {
    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'non_conforme',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: true,
          produits: [],
          refus: [
            {
              id: 1,
              motif: 'Salle de bain pas nettoyée',
              motif_audio_url: null,
              motif_photo_url: null,
              vu: true,
              created_at: '2026-08-15T10:00:00Z',
            },
          ],
        },
      }),
    )

    expect(screen.getByTestId('mission-non-conforme')).toBeInTheDocument()
    expect(screen.getByText(/refusée/i)).toBeInTheDocument()
    expect(screen.getByText('Salle de bain pas nettoyée')).toBeInTheDocument()
  })

  it('n\'affiche pas "Valider" quand la mission est a_faire', () => {
    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'a_faire',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 0,
          vue: true,
          produits: [],
        },
      }),
    )

    expect(screen.queryByRole('button', { name: /^valider$/i })).not.toBeInTheDocument()
  })
})
