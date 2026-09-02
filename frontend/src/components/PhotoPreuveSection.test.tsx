import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoPreuveSection } from './PhotoPreuveSection'
import { ApiError } from '../api'

function makeFile(name = 'travail.jpg', type = 'image/jpeg') {
  return new File(['contenu'], name, { type })
}

describe('PhotoPreuveSection', () => {
  it('le bouton "Ajouter une photo de mon travail" est actif et ouvre le formulaire', async () => {
    const user = userEvent.setup()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={vi.fn()} />)

    const button = screen.getByRole('button', { name: /ajouter une photo de mon travail/i })
    expect(button).toBeEnabled()

    await user.click(button)
    expect(screen.getByRole('heading', { name: /ajouter une photo de mon travail/i })).toBeInTheDocument()
  })

  it('propose caméra et galerie -- accept="image/*", pas de capture forcée', async () => {
    const user = userEvent.setup()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))

    const input = screen.getByLabelText(/photos de preuve de travail/i)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).not.toHaveAttribute('capture')
  })

  it('permet de sélectionner plusieurs photos et affiche un aperçu de chacune', async () => {
    const user = userEvent.setup()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), [makeFile('a.jpg'), makeFile('b.jpg')])

    expect(await screen.findByAltText('Aperçu photo de preuve 1')).toBeInTheDocument()
    expect(screen.getByAltText('Aperçu photo de preuve 2')).toBeInTheDocument()
  })

  it('permet de retirer une photo sélectionnée avant envoi', async () => {
    const user = userEvent.setup()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), [makeFile('a.jpg'), makeFile('b.jpg')])
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1' }))

    expect(screen.queryByAltText('Aperçu photo de preuve 2')).not.toBeInTheDocument()
    expect(screen.getByAltText('Aperçu photo de preuve 1')).toBeInTheDocument()
  })

  it('envoie les photos et la note saisie', async () => {
    const user = userEvent.setup()
    const onAjouter = vi.fn().mockResolvedValue(undefined)
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={onAjouter} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), photo)
    await user.type(screen.getByLabelText(/note/i), 'Salle de bain refaite')
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    await waitFor(() =>
      expect(onAjouter).toHaveBeenCalledWith(10, { photos: [photo], note: 'Salle de bain refaite' }),
    )
    expect(await screen.findByTestId('photo-preuve-confirmation')).toBeInTheDocument()
  })

  it('refuse l\'envoi sans aucune photo', async () => {
    const user = userEvent.setup()
    const onAjouter = vi.fn()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={onAjouter} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(screen.getByText(/ajoutez au moins une photo/i)).toBeInTheDocument()
    expect(onAjouter).not.toHaveBeenCalled()
  })

  it('le bouton Annuler referme le formulaire sans envoyer', async () => {
    const user = userEvent.setup()
    const onAjouter = vi.fn()
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={onAjouter} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), makeFile())
    await user.click(screen.getByRole('button', { name: /annuler/i }))

    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument()
    expect(onAjouter).not.toHaveBeenCalled()
  })

  it('est mis en avant (auto-déplié, message dédié) quand misEnAvant est vrai', () => {
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={vi.fn()} misEnAvant />)

    expect(screen.getByRole('heading', { name: /ajouter une photo de mon travail/i })).toBeInTheDocument()
  })

  it('affiche un message d\'incitation quand misEnAvant est vrai et le formulaire replié', async () => {
    const user = userEvent.setup()
    const onAjouter = vi.fn().mockResolvedValue(undefined)
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={onAjouter} misEnAvant />)

    // Envoyer une photo referme le formulaire -- on peut alors vérifier le message mis en avant.
    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), photo)
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByTestId('photo-preuve-confirmation')).toBeInTheDocument()
    expect(screen.getByText(/mission refusée/i)).toBeInTheDocument()
  })

  it('affiche un message clair quand une photo de preuve est trop lourde', async () => {
    const user = userEvent.setup()
    const onAjouter = vi.fn().mockRejectedValue(new ApiError('Le fichier envoyé est trop volumineux.', 413))
    render(<PhotoPreuveSection missionMenageId={10} onAjouter={onAjouter} />)

    await user.click(screen.getByRole('button', { name: /ajouter une photo de mon travail/i }))
    await user.upload(screen.getByLabelText(/photos de preuve de travail/i), makeFile())
    await user.click(screen.getByRole('button', { name: /^envoyer$/i }))

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })
})
