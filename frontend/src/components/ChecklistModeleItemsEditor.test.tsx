import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChecklistModeleItemsEditor } from './ChecklistModeleItemsEditor'
import type { ChecklistModele } from '../types'

function modeleFixture(overrides: Partial<ChecklistModele> = {}): ChecklistModele {
  return {
    id: 1,
    nom: 'Standard',
    items: [
      { id: 1, checklist_modele_id: 1, libelle: 'Item 1', libelle_ar: null, photo_url: null, ordre: 0 },
      { id: 2, checklist_modele_id: 1, libelle: 'Item 2', libelle_ar: null, photo_url: 'checklist-modele-items/item2.jpg', ordre: 1 },
    ],
    ...overrides,
  }
}

describe('ChecklistModeleItemsEditor', () => {
  it('affiche les items existants dans l\'ordre', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    const items = screen.getAllByText(/Item \d/)
    expect(items.map((el) => el.textContent)).toEqual(['Item 1', 'Item 2'])
  })

  it('affiche le libellé arabe d\'un item existant quand renseigné', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture({
          items: [{ id: 1, checklist_modele_id: 1, libelle: 'Item 1', libelle_ar: 'تنظيف الحمام', photo_url: null, ordre: 0 }],
        })}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getByText('تنظيف الحمام', { exact: false })).toBeInTheDocument()
  })

  it('affiche un message quand le modèle n\'a aucun item', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture({ items: [] })}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getByText(/aucun item/i)).toBeInTheDocument()
  })

  it('ajoute un item via le champ texte, sans photo ni libellé arabe', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn().mockResolvedValue(undefined)
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={onAddItem}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/^nom \(français\)$/i), 'Nettoyer la salle de bain')
    await user.click(screen.getByRole('button', { name: /ajouter/i }))

    expect(onAddItem).toHaveBeenCalledWith(1, 'Nettoyer la salle de bain', null, null)
  })

  it('inclut le libellé arabe optionnel à l\'ajout', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn().mockResolvedValue(undefined)
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={onAddItem}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/^nom \(français\)$/i), 'Nettoyer la salle de bain')
    await user.type(screen.getByLabelText(/nom \(arabe\)/i), 'تنظيف الحمام')
    await user.click(screen.getByRole('button', { name: /ajouter/i }))

    expect(onAddItem).toHaveBeenCalledWith(1, 'Nettoyer la salle de bain', 'تنظيف الحمام', null)
  })

  it('la photo de référence force la caméra -- accept="image/*" capture="environment"', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/photo de référence pour le nouvel item/i)
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
  })

  it('inclut la photo de référence sélectionnée à l\'ajout', async () => {
    const user = userEvent.setup()
    const onAddItem = vi.fn().mockResolvedValue(undefined)
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={onAddItem}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    const photo = new File(['x'], 'exemple.jpg', { type: 'image/jpeg' })
    await user.type(screen.getByLabelText(/^nom \(français\)$/i), 'Nettoyer la salle de bain')
    await user.upload(screen.getByLabelText(/photo de référence pour le nouvel item/i), photo)
    await user.click(screen.getByRole('button', { name: /ajouter/i }))

    expect(onAddItem).toHaveBeenCalledWith(1, 'Nettoyer la salle de bain', null, photo)
  })

  it('affiche la photo de référence d\'un item existant quand présente', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getByAltText('Photo de référence pour "Item 2"')).toBeInTheDocument()
    expect(screen.queryByAltText('Photo de référence pour "Item 1"')).not.toBeInTheDocument()
  })

  it('le bouton monter est désactivé sur le premier item, descendre sur le dernier', () => {
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={vi.fn()}
        onDeplacerItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /monter "item 1"/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /descendre "item 2"/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /descendre "item 1"/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /monter "item 2"/i })).toBeEnabled()
  })

  it('déplacer et retirer un item appellent les callbacks avec le bon id', async () => {
    const user = userEvent.setup()
    const onDeplacerItem = vi.fn()
    const onDeleteItem = vi.fn()
    render(
      <ChecklistModeleItemsEditor
        checklistModele={modeleFixture()}
        onAddItem={vi.fn()}
        onDeplacerItem={onDeplacerItem}
        onDeleteItem={onDeleteItem}
      />,
    )

    await user.click(screen.getByRole('button', { name: /descendre "item 1"/i }))
    expect(onDeplacerItem).toHaveBeenCalledWith(1, 'bas')

    await user.click(screen.getByRole('button', { name: /retirer "item 2"/i }))
    expect(onDeleteItem).toHaveBeenCalledWith(2)
  })
})
