import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProduitsSignalesSection } from './ProduitsSignalesSection'
import type { ProduitMenageSignale } from '../types'

const produitsSignales: ProduitMenageSignale[] = [
  {
    id: 1,
    mission_menage_id: 1,
    photo_url: 'produits-signales/photo1.jpg',
    note: 'Trouvé sous l\'évier',
    prix: null,
    photo_ticket_url: null,
    statut: 'en_attente',
    produit_catalogue_id: null,
  },
]

describe('ProduitsSignalesSection', () => {
  it('affiche le nombre de produits en attente et un message si vide', () => {
    render(<ProduitsSignalesSection produitsSignales={[]} onValider={vi.fn()} onRejeter={vi.fn()} />)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText(/aucun produit signalé/i)).toBeInTheDocument()
  })

  it('affiche la photo et la note de chaque produit signalé', () => {
    render(
      <ProduitsSignalesSection produitsSignales={produitsSignales} onValider={vi.fn()} onRejeter={vi.fn()} />,
    )

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByAltText(/produit signalé/i)).toHaveAttribute(
      'src',
      expect.stringContaining('produits-signales/photo1.jpg'),
    )
    expect(screen.getByText(/Trouvé sous l'évier/)).toBeInTheDocument()
  })

  it('valide un produit signalé avec nom et prix', async () => {
    const user = userEvent.setup()
    const onValider = vi.fn().mockResolvedValue(undefined)
    render(
      <ProduitsSignalesSection produitsSignales={produitsSignales} onValider={onValider} onRejeter={vi.fn()} />,
    )

    const item = screen.getByRole('listitem')
    await user.type(within(item).getByLabelText('Nom'), 'Éponge magique')
    await user.type(within(item).getByLabelText(/prix/i), '15')
    await user.click(within(item).getByRole('button', { name: /valider/i }))

    expect(onValider).toHaveBeenCalledWith(1, { nom: 'Éponge magique', prix: 15 })
  })

  it('exige un nom et un prix pour valider', async () => {
    const user = userEvent.setup()
    const onValider = vi.fn()
    render(
      <ProduitsSignalesSection produitsSignales={produitsSignales} onValider={onValider} onRejeter={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /valider/i }))

    expect(await screen.findByText(/obligatoires/i)).toBeInTheDocument()
    expect(onValider).not.toHaveBeenCalled()
  })

  it('rejette un produit signalé', async () => {
    const user = userEvent.setup()
    const onRejeter = vi.fn().mockResolvedValue(undefined)
    render(
      <ProduitsSignalesSection produitsSignales={produitsSignales} onValider={vi.fn()} onRejeter={onRejeter} />,
    )

    await user.click(screen.getByRole('button', { name: /rejeter/i }))

    expect(onRejeter).toHaveBeenCalledWith(1)
  })
})
