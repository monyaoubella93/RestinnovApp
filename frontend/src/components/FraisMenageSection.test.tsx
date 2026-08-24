import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FraisMenageSection } from './FraisMenageSection'
import type { MissionMenage, ProduitCatalogue, ProduitCatalogueUtilise } from '../types'

const catalogue: ProduitCatalogue[] = [
  { id: 1, nom: 'Javel', prix: '12.50', photo_url: null, actif: true },
  { id: 2, nom: 'Sac poubelle', prix: '7.50', photo_url: 'produits-catalogue/sac.jpg', actif: true },
  { id: 3, nom: 'Ancien produit', prix: '99.00', photo_url: null, actif: false },
]

function produitUtilise(base: ProduitCatalogue, pivot: ProduitCatalogueUtilise['pivot']): ProduitCatalogueUtilise {
  return { ...base, pivot }
}

const missionMenage: MissionMenage = {
  id: 1,
  sejour_id: 1,
  agent_id: 1,
  statut: 'a_faire',
  agent: { id: 1, nom: 'Fatima Z.', role: 'menage', telephone: null },
  frais_forfait: 80,
  vue: true,
  produits: [],
}

function makeFile(name = 'produit.jpg', type = 'image/jpeg') {
  return new File(['contenu'], name, { type })
}

function renderSection(overrides: Partial<Parameters<typeof FraisMenageSection>[0]> = {}) {
  return render(
    <FraisMenageSection
      missionMenage={missionMenage}
      catalogue={catalogue}
      onUpdateProduits={vi.fn()}
      onUpdateProduitUtilise={vi.fn()}
      onDetacherProduit={vi.fn()}
      onSignalerProduit={vi.fn()}
      {...overrides}
    />,
  )
}

describe('FraisMenageSection', () => {
  it('pré-remplit le forfait à 80 et affiche uniquement les produits actifs', () => {
    renderSection()

    expect(screen.getByLabelText(/forfait femme de ménage/i)).toHaveValue(80)
    expect(screen.getByText(/Javel/)).toBeInTheDocument()
    expect(screen.getByText(/Sac poubelle/)).toBeInTheDocument()
    expect(screen.queryByText(/Ancien produit/)).not.toBeInTheDocument()
  })

  it('affiche la photo de référence du produit quand présente', () => {
    renderSection()

    expect(screen.getByAltText('Photo de "Sac poubelle"')).toBeInTheDocument()
    expect(screen.queryByAltText('Photo de "Javel"')).not.toBeInTheDocument()
  })

  it('propose deux pictogrammes (déjà présent / racheté) pour un produit pas encore utilisé', () => {
    renderSection()

    expect(screen.getAllByRole('button', { name: /j'ai utilisé celui déjà présent/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /il était vide, j'en ai racheté un/i })).toHaveLength(2)
  })

  it('enregistre le forfait seul', async () => {
    const user = userEvent.setup()
    const onUpdateProduits = vi.fn().mockResolvedValue(undefined)
    renderSection({ onUpdateProduits })

    const forfaitInput = screen.getByLabelText(/forfait femme de ménage/i)
    await user.clear(forfaitInput)
    await user.type(forfaitInput, '100')
    await user.click(screen.getByRole('button', { name: /enregistrer le forfait/i }))

    expect(onUpdateProduits).toHaveBeenCalledWith(1, { frais_forfait: 100 })
  })

  it('marque un produit "déjà présent" immédiatement, sans photo ni prix', async () => {
    const user = userEvent.setup()
    const onUpdateProduitUtilise = vi.fn().mockResolvedValue(undefined)
    renderSection({ onUpdateProduitUtilise })

    const [javelButtons] = screen.getAllByRole('button', { name: /j'ai utilisé celui déjà présent/i })
    await user.click(javelButtons)

    expect(onUpdateProduitUtilise).toHaveBeenCalledWith(1, 1, { type_utilisation: 'stock_existant' })
  })

  it('ouvre un formulaire photo+prix pour "racheté", et refuse de valider sans les deux', async () => {
    const user = userEvent.setup()
    const onUpdateProduitUtilise = vi.fn()
    renderSection({ onUpdateProduitUtilise })

    const [racheteButton] = screen.getAllByRole('button', { name: /il était vide, j'en ai racheté un/i })
    await user.click(racheteButton)

    expect(screen.getByLabelText(/photo du produit ou du ticket de caisse/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/prix payé/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^valider$/i }))

    expect(await screen.findByText(/photo et prix obligatoires/i)).toBeInTheDocument()
    expect(onUpdateProduitUtilise).not.toHaveBeenCalled()
  })

  it('valide un produit "racheté" avec photo et prix réel', async () => {
    const user = userEvent.setup()
    const onUpdateProduitUtilise = vi.fn().mockResolvedValue(undefined)
    renderSection({ onUpdateProduitUtilise })

    await user.click(screen.getAllByRole('button', { name: /il était vide, j'en ai racheté un/i })[0])

    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photo du produit ou du ticket de caisse/i), photo)
    await user.type(screen.getByLabelText(/prix payé/i), '15')
    await user.click(screen.getByRole('button', { name: /^valider$/i }))

    expect(onUpdateProduitUtilise).toHaveBeenCalledWith(1, 1, {
      type_utilisation: 'rachete',
      photo,
      prix_paye: 15,
    })
  })

  it('affiche un badge "Déjà présent" pour un produit stock_existant, sans compter dans le total', () => {
    renderSection({
      missionMenage: {
        ...missionMenage,
        produits: [produitUtilise(catalogue[0], { type_utilisation: 'stock_existant', photo_url: null, prix_paye: null })],
      },
    })

    expect(screen.getByTestId('produit-badge-1')).toHaveTextContent('Déjà présent')
    expect(screen.getByTestId('total-frais-menage-1')).toHaveTextContent('80.00 MAD')
  })

  it('affiche un badge "Racheté" avec le prix réel, compté dans le total (pas le prix catalogue)', () => {
    renderSection({
      missionMenage: {
        ...missionMenage,
        produits: [
          produitUtilise(catalogue[0], {
            type_utilisation: 'rachete',
            photo_url: 'mission-menage-produits/preuve.jpg',
            prix_paye: 27.5,
          }),
        ],
      },
    })

    expect(screen.getByTestId('produit-badge-1')).toHaveTextContent('27.50')
    // 80 forfait + 27.50 real prix_paye, not the catalogue's 12.50
    expect(screen.getByTestId('total-frais-menage-1')).toHaveTextContent('107.50 MAD')
  })

  it('seuls les produits rachetés comptent quand mélangés avec du stock existant', () => {
    renderSection({
      missionMenage: {
        ...missionMenage,
        produits: [
          produitUtilise(catalogue[0], { type_utilisation: 'stock_existant', photo_url: null, prix_paye: null }),
          produitUtilise(catalogue[1], { type_utilisation: 'rachete', photo_url: 'x.jpg', prix_paye: 15 }),
        ],
      },
    })

    // 80 forfait + 15 (only the rachete one)
    expect(screen.getByTestId('total-frais-menage-1')).toHaveTextContent('95.00 MAD')
  })

  it('retire un produit déjà utilisé via le bouton "Retirer"', async () => {
    const user = userEvent.setup()
    const onDetacherProduit = vi.fn().mockResolvedValue(undefined)
    renderSection({
      onDetacherProduit,
      missionMenage: {
        ...missionMenage,
        produits: [produitUtilise(catalogue[0], { type_utilisation: 'stock_existant', photo_url: null, prix_paye: null })],
      },
    })

    await user.click(screen.getByRole('button', { name: /retirer/i }))

    expect(onDetacherProduit).toHaveBeenCalledWith(1, 1)
  })

  it('affiche le formulaire "Signaler un nouveau produit" et envoie photo + note', async () => {
    const user = userEvent.setup()
    const onSignalerProduit = vi.fn().mockResolvedValue(undefined)
    renderSection({ onSignalerProduit })

    await user.click(screen.getByRole('button', { name: /signaler un nouveau produit/i }))

    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photo du produit$/i), photo)
    await user.type(screen.getByLabelText(/note/i), 'Trouvé sous l\'évier')
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(onSignalerProduit).toHaveBeenCalledWith(1, { photo, note: "Trouvé sous l'évier" })
    expect(await screen.findByText(/en attente de validation/i)).toBeInTheDocument()
  })

  it('refuse de signaler un produit sans photo', async () => {
    const user = userEvent.setup()
    const onSignalerProduit = vi.fn()
    renderSection({ onSignalerProduit })

    await user.click(screen.getByRole('button', { name: /signaler un nouveau produit/i }))
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(await screen.findByText(/photo est obligatoire/i)).toBeInTheDocument()
    expect(onSignalerProduit).not.toHaveBeenCalled()
  })
})
