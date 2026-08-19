import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncStatusPill } from './SyncStatusPill'

describe('SyncStatusPill', () => {
  it('affiche "Tout est synchronisé" quand en ligne et sans file d\'attente', () => {
    render(<SyncStatusPill online pendingCount={0} />)

    expect(screen.getByText('Tout est synchronisé')).toBeInTheDocument()
  })

  it('affiche "Hors ligne" avec le nombre d\'actions en attente quand hors ligne', () => {
    render(<SyncStatusPill online={false} pendingCount={3} />)

    expect(screen.getByText(/hors ligne · 3 actions en attente/i)).toBeInTheDocument()
  })

  it('affiche "Synchronisation…" quand en ligne mais la file n\'est pas encore vide', () => {
    render(<SyncStatusPill online pendingCount={1} />)

    expect(screen.getByText(/synchronisation… 1 action en attente/i)).toBeInTheDocument()
  })
})
