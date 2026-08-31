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
      onAnnuler={noop}
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
        onAnnuler={noop}
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
            { id: 1, mission_menage_id: 10, libelle: 'Changer les draps', libelle_ar: null, coche: true, photo_url: null, photo_reference_url: null, ordre: 0 },
          ],
          produits_signales: [
            {
              id: 1,
              mission_menage_id: 10,
              photo_url: 'produits-signales/photo.jpg',
              prix: null,
              photo_ticket_url: null,
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
              prix: null,
              photo_ticket_url: null,
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

  it('n\'expose aucune saisie photo/prix produit au Manager : lecture seule uniquement', async () => {
    const user = userEvent.setup()
    const catalogue = [
      { id: 1, nom: 'Javel', nom_ar: null, prix: 12, photo_url: null, actif: true },
      { id: 2, nom: 'Éponges', nom_ar: null, prix: 8, photo_url: null, actif: true },
    ]

    renderCard(
      sejourFixture({
        mission_menage: {
          id: 10,
          sejour_id: 1,
          agent_id: 5,
          statut: 'en_attente_validation',
          agent: { id: 5, nom: 'Fatima Z.', role: 'menage', telephone: null },
          frais_forfait: 80,
          vue: true,
          produits: [
            {
              id: 1,
              nom: 'Javel', nom_ar: null,
              prix: 12,
              photo_url: null,
              actif: true,
              pivot: { type_utilisation: 'rachete', prix_paye: 9.5, photo_url: 'produits/javel-preuve.jpg' },
            },
          ],
        },
      }),
      { catalogue },
    )

    // Javel: resolved by the agent -- read-only badge, visible both in the
    // always-on frais panel and in the "Voir le détail" validation panel.
    expect(screen.getAllByText(/racheté · 9\.50 mad/i).length).toBeGreaterThan(0)
    // Éponges: never touched by the agent -- placeholder, not a picker.
    expect(screen.getAllByText('En attente de la femme de ménage').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /voir le détail/i }))

    // No agent-only input anywhere on this Manager screen.
    expect(screen.queryByRole('button', { name: /j'ai utilisé celui déjà présent/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /il était vide, j'en ai racheté un/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /signaler un nouveau produit/i })).not.toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('affiche le bouton "Annuler" uniquement pour un séjour à venir', () => {
    renderCard(sejourFixture({ statut: 'a_venir' }))
    expect(screen.getByRole('button', { name: /^annuler$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirmer le checkout/i })).not.toBeInTheDocument()
  })

  it('n\'affiche pas le bouton "Annuler" pour un séjour en cours, terminé ou annulé', () => {
    let view = renderCard(sejourFixture({ statut: 'en_cours' }))
    expect(screen.queryByRole('button', { name: /^annuler$/i })).not.toBeInTheDocument()
    view.unmount()

    view = renderCard(sejourFixture({ statut: 'termine' }))
    expect(screen.queryByRole('button', { name: /^annuler$/i })).not.toBeInTheDocument()
    view.unmount()

    view = renderCard(sejourFixture({ statut: 'annule' }))
    expect(screen.queryByRole('button', { name: /^annuler$/i })).not.toBeInTheDocument()
  })

  it('affiche "Confirmer le checkout" uniquement pour un séjour en cours', () => {
    let view = renderCard(sejourFixture({ statut: 'en_cours' }))
    expect(screen.getByRole('button', { name: /confirmer le checkout/i })).toBeInTheDocument()
    view.unmount()

    view = renderCard(sejourFixture({ statut: 'a_venir' }))
    expect(screen.queryByRole('button', { name: /confirmer le checkout/i })).not.toBeInTheDocument()
    view.unmount()

    view = renderCard(sejourFixture({ statut: 'termine' }))
    expect(screen.queryByRole('button', { name: /confirmer le checkout/i })).not.toBeInTheDocument()
    view.unmount()

    view = renderCard(sejourFixture({ statut: 'annule' }))
    expect(screen.queryByRole('button', { name: /confirmer le checkout/i })).not.toBeInTheDocument()
  })

  it('ouvre une modal de confirmation et appelle onAnnuler quand on confirme l\'annulation', async () => {
    const user = userEvent.setup()
    const onAnnuler = vi.fn().mockResolvedValue(undefined)

    renderCard(sejourFixture({ statut: 'a_venir' }), { onAnnuler })

    await user.click(screen.getByRole('button', { name: /^annuler$/i }))

    expect(screen.getByText('Êtes-vous sûr de vouloir annuler ce séjour ?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /annuler le séjour$/i }))

    expect(onAnnuler).toHaveBeenCalledWith(1)
  })

  it('ne fait rien quand on annule la modal de confirmation d\'annulation', async () => {
    const user = userEvent.setup()
    const onAnnuler = vi.fn().mockResolvedValue(undefined)

    renderCard(sejourFixture({ statut: 'a_venir' }), { onAnnuler })

    await user.click(screen.getByRole('button', { name: /^annuler$/i }))
    // Two "Annuler" buttons now: the row action and the modal's own cancel button.
    await user.click(screen.getAllByRole('button', { name: /^annuler$/i })[1])

    expect(onAnnuler).not.toHaveBeenCalled()
    expect(screen.queryByText('Êtes-vous sûr de vouloir annuler ce séjour ?')).not.toBeInTheDocument()
  })
})
