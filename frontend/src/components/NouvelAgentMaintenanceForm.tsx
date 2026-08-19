import { useState, type FormEvent } from 'react'
import type { NewUtilisateurInput } from '../api'

interface NouvelAgentMaintenanceFormProps {
  onSubmit: (input: NewUtilisateurInput) => Promise<void>
  onCancel?: () => void
}

export function NouvelAgentMaintenanceForm({ onSubmit, onCancel }: NouvelAgentMaintenanceFormProps) {
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [adresse, setAdresse] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setNom('')
    setTelephone('')
    setAdresse('')
    setPassword('')
    setError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!nom.trim()) {
      setError('Le nom est obligatoire.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        nom,
        role: 'maintenance',
        telephone: telephone.trim() ? telephone : null,
        adresse: adresse.trim() ? adresse : null,
        password: password.trim() ? password : null,
      })
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Nouvel agent de maintenance</h2>

      <div>
        <label htmlFor="agent_maintenance_nom" className="block text-sm font-semibold text-ink-secondary">
          Nom
        </label>
        <input
          id="agent_maintenance_nom"
          type="text"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Karim Benali"
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="agent_maintenance_telephone" className="block text-sm font-semibold text-ink-secondary">
          Téléphone
        </label>
        <input
          id="agent_maintenance_telephone"
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Optionnel"
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="agent_maintenance_adresse" className="block text-sm font-semibold text-ink-secondary">
          Adresse
        </label>
        <input
          id="agent_maintenance_adresse"
          type="text"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="Optionnel"
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="agent_maintenance_password" className="block text-sm font-semibold text-ink-secondary">
          Mot de passe
        </label>
        <input
          id="agent_maintenance_password"
          type="text"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-tertiary">Vous pourrez communiquer ce mot de passe à l'agent</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            resetForm()
            onCancel?.()
          }}
          className="rounded-field border border-border-default px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-field bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {submitting ? 'Enregistrement...' : 'Créer le compte'}
        </button>
      </div>
    </form>
  )
}
