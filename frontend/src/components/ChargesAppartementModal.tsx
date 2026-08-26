import { useState } from 'react'
import type { NewChargeAppartementInput } from '../api'
import type { ChargeAppartement } from '../types'

interface ChargesAppartementModalProps {
  appartementNom: string
  mois: string
  charges: ChargeAppartement[]
  onClose: () => void
  onAdd: (input: NewChargeAppartementInput) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function formatMontant(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Manual monthly charges (WiFi, électricité, pressing, ...) on an
 * appartement's relevé -- anything the app doesn't already derive from
 * ménage/maintenance activity, entered once per appartement/mois so it
 * shows up on the facture PDF exactly as typed.
 */
export function ChargesAppartementModal({
  appartementNom,
  mois,
  charges,
  onClose,
  onAdd,
  onDelete,
}: ChargesAppartementModalProps) {
  const [description, setDescription] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [prixUnitaire, setPrixUnitaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async () => {
    setError(null)

    const quantiteNum = Number(quantite)
    const prixNum = Number(prixUnitaire)

    if (!description.trim()) {
      setError('La description est obligatoire.')
      return
    }
    if (!quantiteNum || quantiteNum <= 0) {
      setError('La quantité doit être supérieure à 0.')
      return
    }
    if (!prixUnitaire.trim() || prixNum < 0 || Number.isNaN(prixNum)) {
      setError('Le prix unitaire est obligatoire.')
      return
    }

    setSubmitting(true)
    try {
      await onAdd({ mois, description: description.trim(), quantite: quantiteNum, prix_unitaire: prixNum })
      setDescription('')
      setQuantite('1')
      setPrixUnitaire('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    setError(null)
    setDeletingId(id)
    try {
      await onDelete(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-card-manager bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Charges — {appartementNom}</h3>
          <button type="button" aria-label="Fermer" onClick={onClose} className="text-ink-tertiary hover:text-ink">
            ✕
          </button>
        </div>
        <p className="text-[13px] text-ink-tertiary">
          Charges manuelles du mois {mois} (WiFi, électricité, pressing, ...), affichées sur la facture PDF.
        </p>

        {charges.length === 0 ? (
          <p className="mt-3 text-sm text-ink-tertiary">Aucune charge ajoutée ce mois-ci.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-light">
            {charges.map((charge) => (
              <li key={charge.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-ink">{charge.description}</p>
                  <p className="text-ink-tertiary">
                    {charge.quantite} × {formatMontant(charge.prix_unitaire)} MAD ={' '}
                    <span className="font-semibold text-ink">{formatMontant(charge.total)} MAD</span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Supprimer la charge ${charge.description}`}
                  onClick={() => handleDelete(charge.id)}
                  disabled={deletingId === charge.id}
                  className="text-sm font-semibold text-danger hover:brightness-90 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 rounded-field border border-border-default p-3 sm:grid-cols-4">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (ex : WiFi)"
            className="rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none sm:col-span-2"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            placeholder="Quantité"
            className="rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={prixUnitaire}
            onChange={(e) => setPrixUnitaire(e.target.value)}
            placeholder="Prix unitaire"
            className="rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting}
            className="rounded-field bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50 sm:col-span-4"
          >
            {submitting ? 'Ajout...' : '+ Ajouter la charge'}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
