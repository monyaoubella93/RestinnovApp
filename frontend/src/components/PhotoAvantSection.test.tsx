import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoAvantSection } from './PhotoAvantSection'
import { ApiError } from '../api'

function makeFile(name = 'avant.jpg', type = 'image/jpeg') {
  return new File(['contenu'], name, { type })
}

describe('PhotoAvantSection', () => {
  it('affiche le bouton pour prendre la photo avant ménage', () => {
    render(<PhotoAvantSection missionMenageId={10} onCommencer={vi.fn()} />)

    expect(screen.getByRole('button', { name: /prendre la photo avant ménage/i })).toBeInTheDocument()
  })

  it('envoie la photo sélectionnée', async () => {
    const user = userEvent.setup()
    const onCommencer = vi.fn().mockResolvedValue(undefined)
    render(<PhotoAvantSection missionMenageId={10} onCommencer={onCommencer} />)

    const photo = makeFile()
    await user.upload(screen.getByLabelText(/photo avant ménage/i), photo)

    await waitFor(() => expect(onCommencer).toHaveBeenCalledWith(10, photo))
  })

  it('ne permet pas la capture caméra uniquement -- pas d\'attribut capture sur l\'input', () => {
    render(<PhotoAvantSection missionMenageId={10} onCommencer={vi.fn()} />)

    expect(screen.getByLabelText(/photo avant ménage/i)).toHaveAttribute('capture', 'environment')
  })

  it('force la caméra -- accept="image/*" capture="environment"', () => {
    render(<PhotoAvantSection missionMenageId={10} onCommencer={vi.fn()} />)

    expect(screen.getByLabelText(/photo avant ménage/i)).toHaveAttribute('accept', 'image/*')
  })

  it('affiche un message clair quand la photo est trop lourde', async () => {
    const user = userEvent.setup()
    const onCommencer = vi.fn().mockRejectedValue(new ApiError('Le fichier envoyé est trop volumineux.', 413))
    render(<PhotoAvantSection missionMenageId={10} onCommencer={onCommencer} />)

    await user.upload(screen.getByLabelText(/photo avant ménage/i), makeFile())

    expect(await screen.findByText(/photo trop lourde, réessayez avec une photo plus légère/i)).toBeInTheDocument()
  })

  it('affiche l\'erreur générique renvoyée par le serveur', async () => {
    const user = userEvent.setup()
    const onCommencer = vi.fn().mockRejectedValue(new Error('Erreur réseau'))
    render(<PhotoAvantSection missionMenageId={10} onCommencer={onCommencer} />)

    await user.upload(screen.getByLabelText(/photo avant ménage/i), makeFile())

    expect(await screen.findByText('Erreur réseau')).toBeInTheDocument()
  })
})
