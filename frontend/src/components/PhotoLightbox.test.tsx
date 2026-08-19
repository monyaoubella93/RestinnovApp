import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoLightbox } from './PhotoLightbox'

describe('PhotoLightbox', () => {
  it('affiche la photo en grand et ferme au clic sur le bouton de fermeture', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PhotoLightbox src="/storage/preuve.jpg" alt="Photo de preuve du travail" onClose={onClose} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByAltText('Photo de preuve du travail')).toHaveAttribute('src', '/storage/preuve.jpg')

    await user.click(screen.getByRole('button', { name: /fermer l'aperçu/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('ferme au clic sur le fond, mais pas au clic sur la photo elle-même', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PhotoLightbox src="/storage/preuve.jpg" alt="Photo de preuve du travail" onClose={onClose} />)

    await user.click(screen.getByAltText('Photo de preuve du travail'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('ferme avec la touche Échap', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PhotoLightbox src="/storage/preuve.jpg" alt="Photo de preuve du travail" onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
