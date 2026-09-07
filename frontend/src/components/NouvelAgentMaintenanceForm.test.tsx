import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NouvelAgentMaintenanceForm } from './NouvelAgentMaintenanceForm'

describe('NouvelAgentMaintenanceForm', () => {
  it('n\'affiche aucun champ "appartements assignés"', () => {
    render(<NouvelAgentMaintenanceForm onSubmit={vi.fn()} />)

    expect(screen.queryByText(/appartements assignés/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('affiche le mot de passe en clair (pas type="password") avec un texte d\'aide', () => {
    render(<NouvelAgentMaintenanceForm onSubmit={vi.fn()} />)

    const passwordInput = screen.getByLabelText(/mot de passe/i)
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByText(/vous pourrez communiquer ce mot de passe à l'agent/i)).toBeInTheDocument()
  })

  it('soumet le formulaire avec le payload attendu et role maintenance fixé', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NouvelAgentMaintenanceForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nom'), 'Karim Benali')
    await user.type(screen.getByLabelText(/téléphone/i), '0622222222')
    await user.type(screen.getByLabelText(/adresse/i), '3 rue des Artisans, Rabat')
    await user.type(screen.getByLabelText(/mot de passe/i), 'motdepasse123')
    await user.click(screen.getByRole('button', { name: /créer le compte/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      nom: 'Karim Benali',
      role: 'maintenance',
      telephone: '0622222222',
      adresse: '3 rue des Artisans, Rabat',
      password: 'motdepasse123',
    })
  })

  it('envoie telephone et adresse à null quand rien n\'est renseigné', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NouvelAgentMaintenanceForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nom'), 'Karim Benali')
    await user.type(screen.getByLabelText(/mot de passe/i), 'motdepasse123')
    await user.click(screen.getByRole('button', { name: /créer le compte/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      nom: 'Karim Benali',
      role: 'maintenance',
      telephone: null,
      adresse: null,
      password: 'motdepasse123',
    })
  })

  it('exige un nom', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container } = render(<NouvelAgentMaintenanceForm onSubmit={onSubmit} />)

    container.querySelector('#agent_maintenance_nom')?.removeAttribute('required')
    container.querySelector('#agent_maintenance_password')?.removeAttribute('required')

    await user.click(screen.getByRole('button', { name: /créer le compte/i }))

    expect(await screen.findByText(/obligatoire/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('le bouton Annuler réinitialise le formulaire', async () => {
    const user = userEvent.setup()
    render(<NouvelAgentMaintenanceForm onSubmit={vi.fn()} />)

    await user.type(screen.getByLabelText('Nom'), 'Karim Benali')
    await user.type(screen.getByLabelText(/mot de passe/i), 'motdepasse123')

    await user.click(screen.getByRole('button', { name: /annuler/i }))

    expect(screen.getByLabelText('Nom')).toHaveValue('')
    expect(screen.getByLabelText(/mot de passe/i)).toHaveValue('')
  })

  // --- edit mode (agentToEdit) ---

  const agentToEdit = { id: 7, nom: 'Karim Benali', role: 'maintenance', telephone: '0699999999', adresse: '10 rue des Oliviers' }

  it('en mode édition, préremplit nom/téléphone/adresse et laisse le mot de passe vide', () => {
    render(<NouvelAgentMaintenanceForm onSubmit={vi.fn()} agentToEdit={agentToEdit} />)

    expect(screen.getByRole('heading', { name: "Modifier l'agent de maintenance" })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('Karim Benali')
    expect(screen.getByLabelText(/téléphone/i)).toHaveValue('0699999999')
    expect(screen.getByLabelText(/adresse/i)).toHaveValue('10 rue des Oliviers')
    expect(screen.getByLabelText(/mot de passe/i)).toHaveValue('')
  })

  it('en mode édition, le mot de passe est optionnel', () => {
    render(<NouvelAgentMaintenanceForm onSubmit={vi.fn()} agentToEdit={agentToEdit} />)

    expect(screen.getByLabelText(/mot de passe/i)).not.toBeRequired()
    expect(screen.getByRole('button', { name: /enregistrer les modifications/i })).toBeInTheDocument()
  })

  it('en mode édition, soumet sans mot de passe quand il est laissé vide', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NouvelAgentMaintenanceForm onSubmit={onSubmit} agentToEdit={agentToEdit} />)

    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Nom'), 'Karim B.')
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Karim B.', password: null }))
  })

  it('en mode édition, soumet le nouveau mot de passe quand il est renseigné', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NouvelAgentMaintenanceForm onSubmit={onSubmit} agentToEdit={agentToEdit} />)

    await user.type(screen.getByLabelText(/mot de passe/i), 'nouveau-mdp')
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ password: 'nouveau-mdp' }))
  })
})
