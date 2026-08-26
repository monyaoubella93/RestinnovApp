import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NouvelAppartementForm } from './NouvelAppartementForm'
import type { Agent, Appartement, ChecklistModele, Proprietaire } from '../types'

const checklistModeles: ChecklistModele[] = [{ id: 1, nom: 'Checklist standard' }]
const agentsMenage: Agent[] = [{ id: 2, nom: 'Fatima Z.', role: 'menage', telephone: null }]
const proprietaires: Proprietaire[] = [{ id: 5, nom: 'Karim Alaoui', telephone: null, email: null, adresse: null }]

function baseProps() {
  return {
    checklistModeles,
    agentsMenage,
    proprietaires,
    onSubmit: vi.fn(),
    onCreateProprietaire: vi.fn(),
    onCreateChecklistModele: vi.fn(),
    onAddChecklistModeleItem: vi.fn(),
    onDeplacerChecklistModeleItem: vi.fn(),
    onDeleteChecklistModeleItem: vi.fn(),
  }
}

/** Mirrors how App.tsx owns the checklist list, so a newly created modele becomes a selectable option. */
function ManagedForm({ onCreateChecklistModele }: { onCreateChecklistModele: (nom: string) => Promise<ChecklistModele> }) {
  const [modeles, setModeles] = useState(checklistModeles)

  return (
    <NouvelAppartementForm
      {...baseProps()}
      checklistModeles={modeles}
      onCreateChecklistModele={async (nom) => {
        const created = await onCreateChecklistModele(nom)
        setModeles((current) => [...current, created])
        return created
      }}
    />
  )
}

/** Mirrors how App.tsx owns the proprietaire list, so a newly created one becomes a selectable option. */
function ManagedFormWithProprietaire({
  onCreateProprietaire,
}: {
  onCreateProprietaire: (input: { nom: string; telephone?: string | null; email?: string | null }) => Promise<Proprietaire>
}) {
  const [proprietairesState, setProprietairesState] = useState(proprietaires)

  return (
    <NouvelAppartementForm
      {...baseProps()}
      proprietaires={proprietairesState}
      onCreateProprietaire={async (input) => {
        const created = await onCreateProprietaire(input)
        setProprietairesState((current) => [...current, created])
        return created
      }}
    />
  )
}

function makeFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['contenu'], name, { type })
}

describe('NouvelAppartementForm', () => {
  it('affiche le statut en lecture seule avec la mention explicative', () => {
    render(<NouvelAppartementForm {...baseProps()} />)

    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(/géré automatiquement/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /statut/i })).not.toBeInTheDocument()
  })

  it('met à jour la zone de dépôt quand un fichier est choisi', async () => {
    const user = userEvent.setup()
    render(<NouvelAppartementForm {...baseProps()} />)

    const input = screen.getByLabelText('Photo principale', { selector: 'input' })
    await user.upload(input, makeFile())

    expect(await screen.findByText('photo.jpg')).toBeInTheDocument()
  })

  it('permet de créer un nouveau modèle de checklist à la volée et le sélectionne', async () => {
    const user = userEvent.setup()
    const onCreateChecklistModele = vi.fn().mockResolvedValue({ id: 99, nom: 'Checklist studio' })
    render(<ManagedForm onCreateChecklistModele={onCreateChecklistModele} />)

    await user.click(screen.getByRole('button', { name: /créer un nouveau modèle/i }))
    await user.type(screen.getByPlaceholderText(/nom du nouveau modèle/i), 'Checklist studio')
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }))

    expect(onCreateChecklistModele).toHaveBeenCalledWith('Checklist studio')
    expect(await screen.findByRole('checkbox', { name: 'Checklist studio' })).toBeChecked()
  })

  it('soumet le formulaire avec le payload attendu', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NouvelAppartementForm {...baseProps()} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/nom d'appartement/i), 'Zenith 3ème étage')
    await user.type(screen.getByLabelText(/adresse complète/i), '10 avenue Hassan II')
    const photo = makeFile()
    await user.upload(screen.getByLabelText('Photo principale', { selector: 'input' }), photo)
    await user.click(screen.getByRole('checkbox', { name: 'Checklist standard' }))
    await user.selectOptions(screen.getByRole('combobox', { name: /agent de ménage habituel/i }), '2')

    await user.click(screen.getByRole('button', { name: /enregistrer l'appartement/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      nom: 'Zenith 3ème étage',
      adresse: '10 avenue Hassan II',
      photo,
      checklist_modele_ids: [1],
      agent_habituel_id: 2,
      proprietaire_id: null,
      mode_gestion: 'mandat',
      taux_commission: null,
      loyer_fixe_mensuel: null,
    })
  })

  it('refuse un fichier qui n\'est pas au format JPG/PNG', async () => {
    render(<NouvelAppartementForm {...baseProps()} />)

    const input = screen.getByLabelText('Photo principale', { selector: 'input' })
    // fireEvent bypasses the input's `accept` filter, exercising the JS-level validation
    // (a drag-and-drop of a mistyped file would hit the same code path).
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } })

    expect(await screen.findByText(/JPG ou PNG/i)).toBeInTheDocument()
  })

  it('exige un nom et une adresse', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container } = render(<NouvelAppartementForm {...baseProps()} onSubmit={onSubmit} />)

    // bypass native HTML5 "required" blocking to exercise the JS-level check
    container.querySelector('form')?.removeAttribute('required')
    for (const el of container.querySelectorAll('[required]')) {
      el.removeAttribute('required')
    }

    await user.click(screen.getByRole('button', { name: /enregistrer l'appartement/i }))

    expect(await screen.findByText(/obligatoires/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('bascule entre taux de commission (mandat) et loyer fixe (sous-location)', async () => {
    const user = userEvent.setup()
    render(<NouvelAppartementForm {...baseProps()} />)

    expect(screen.getByLabelText(/taux de commission/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/loyer fixe mensuel/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sous-location' }))

    expect(screen.queryByLabelText(/taux de commission/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/loyer fixe mensuel/i)).toBeInTheDocument()
  })

  it('permet de créer un nouveau propriétaire à la volée et le sélectionne', async () => {
    const user = userEvent.setup()
    const onCreateProprietaire = vi
      .fn()
      .mockResolvedValue({ id: 42, nom: 'Sara Bennani', telephone: null, email: null, adresse: null })
    render(<ManagedFormWithProprietaire onCreateProprietaire={onCreateProprietaire} />)

    await user.click(screen.getByRole('button', { name: /créer un nouveau propriétaire/i }))
    await user.type(screen.getByPlaceholderText(/nom du propriétaire/i), 'Sara Bennani')
    await user.click(screen.getByRole('button', { name: /^créer$/i }))

    expect(onCreateProprietaire).toHaveBeenCalledWith({
      nom: 'Sara Bennani',
      telephone: null,
      email: null,
      adresse: null,
    })
    expect(await screen.findByRole('combobox', { name: /propriétaire/i })).toHaveValue('42')
  })

  describe('mode édition', () => {
    const appartementToEdit: Appartement = {
      id: 3,
      nom: 'Loft Bastille',
      adresse: '12 rue de la Roquette',
      statut: 'occupe',
      photo_principale: null,
      checklist_modeles: [{ id: 1, nom: 'Checklist standard' }],
      agent_habituel_id: 2,
      proprietaire_id: 5,
      mode_gestion: 'mandat',
      taux_commission: 15,
      loyer_fixe_mensuel: null,
    }

    it('préremplit le formulaire et affiche le statut réel (lecture seule)', () => {
      render(<NouvelAppartementForm {...baseProps()} appartementToEdit={appartementToEdit} />)

      expect(screen.getByRole('heading', { name: "Modifier l'appartement" })).toBeInTheDocument()
      expect(screen.getByLabelText(/nom d'appartement/i)).toHaveValue('Loft Bastille')
      expect(screen.getByLabelText(/adresse complète/i)).toHaveValue('12 rue de la Roquette')
      expect(screen.getByRole('checkbox', { name: 'Checklist standard' })).toBeChecked()
      expect(screen.getByRole('combobox', { name: /agent de ménage habituel/i })).toHaveValue('2')
      expect(screen.getByRole('combobox', { name: /propriétaire/i })).toHaveValue('5')
      expect(screen.getByLabelText(/taux de commission/i)).toHaveValue(15)
      expect(screen.getByText('Occupé')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /enregistrer les modifications/i })).toBeInTheDocument()
    })

    it('soumet le payload modifié sans statut', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(<NouvelAppartementForm {...baseProps()} onSubmit={onSubmit} appartementToEdit={appartementToEdit} />)

      await user.clear(screen.getByLabelText(/nom d'appartement/i))
      await user.type(screen.getByLabelText(/nom d'appartement/i), 'Loft Bastille rénové')
      await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: 'Loft Bastille rénové',
          adresse: '12 rue de la Roquette',
          checklist_modele_ids: [1],
          agent_habituel_id: 2,
          proprietaire_id: 5,
          mode_gestion: 'mandat',
          taux_commission: 15,
        }),
      )
    })

    it('revient à un formulaire vierge quand appartementToEdit redevient null', () => {
      const { rerender } = render(<NouvelAppartementForm {...baseProps()} appartementToEdit={appartementToEdit} />)
      expect(screen.getByLabelText(/nom d'appartement/i)).toHaveValue('Loft Bastille')

      rerender(<NouvelAppartementForm {...baseProps()} appartementToEdit={null} />)

      expect(screen.getByRole('heading', { name: 'Nouvel appartement' })).toBeInTheDocument()
      expect(screen.getByLabelText(/nom d'appartement/i)).toHaveValue('')
      expect(screen.getByText('Disponible')).toBeInTheDocument()
    })
  })
})
