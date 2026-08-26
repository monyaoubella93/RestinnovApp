import { useState } from 'react'
import type { NewProprietaireInput } from '../api'
import type { Proprietaire } from '../types'

interface EditProprietaireModalProps {
  proprietaire: Proprietaire
  onCancel: () => void
  onSave: (input: NewProprietaireInput) => Promise<void>
}

/**
 * Lets the Manager fill in or correct a propriétaire's contact details
 * (téléphone/email/adresse) after creation -- useful when they were left
 * blank at quick-creation time (from the "Nouvel appartement" form) but are
 * needed to generate a complete facture.
 */
export function EditProprietaireModal({ proprietaire, onCancel, onSave }: EditProprietaireModalProps) {
  const [nom, setNom] = useState(proprietaire.nom)
  const [telephone, setTelephone] = useState(proprietaire.telephone ?? '')
  const [email, setEmail] = useState(proprietaire.email ?? '')
  const [adresse, setAdresse] = useState(proprietaire.adresse ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!nom.trim()) {
      setError('Le nom est obligatoire.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await onSave({
        nom: nom.trim(),
        telephone: telephone.trim() || null,
        email: email.trim() || null,
        adresse: adresse.trim() || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-card-manager bg-surface p-5 shadow-lg">
        <h3 className="text-base font-bold text-ink">Modifier le propriétaire</h3>

        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor="edit_proprietaire_nom" className="block text-xs font-semibold text-ink-secondary">
              Nom
            </label>
            <input
              id="edit_proprietaire_nom"
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="edit_proprietaire_telephone" className="block text-xs font-semibold text-ink-secondary">
              Téléphone
            </label>
            <input
              id="edit_proprietaire_telephone"
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="edit_proprietaire_email" className="block text-xs font-semibold text-ink-secondary">
              Email
            </label>
            <input
              id="edit_proprietaire_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="edit_proprietaire_adresse" className="block text-xs font-semibold text-ink-secondary">
              Adresse
            </label>
            <input
              id="edit_proprietaire_adresse"
              type="text"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
          >
            {submitting ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
