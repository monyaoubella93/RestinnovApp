import { useState } from 'react'
import type { FraisMaintenance } from '../types'

interface FraisMaintenanceSectionProps {
  sejourId: number
  fraisMaintenance: FraisMaintenance[]
  onAdd: (sejourId: number, input: { description: string; prix: number }) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function FraisMaintenanceSection({
  sejourId,
  fraisMaintenance,
  onAdd,
  onDelete,
}: FraisMaintenanceSectionProps) {
  const [description, setDescription] = useState('')
  const [prix, setPrix] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const total = fraisMaintenance.reduce((sum, f) => sum + (Number(f.prix) || 0), 0)

  const handleAdd = async () => {
    setError(null)
    if (!description.trim() || !prix) {
      setError('La description et le prix sont obligatoires.')
      return
    }

    setSubmitting(true)
    try {
      await onAdd(sejourId, { description, prix: Number(prix) })
      setDescription('')
      setPrix('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mt-3 rounded-field border border-border-default p-3">
      <p className="text-sm font-bold text-ink">Frais de maintenance</p>

      {fraisMaintenance.length > 0 && (
        <ul className="mt-2 space-y-1">
          {fraisMaintenance.map((frais) => (
            <li key={frais.id} className="flex items-center justify-between text-sm text-ink-secondary">
              <span>
                {frais.description} — <span className="font-mono">{Number(frais.prix).toFixed(2)} MAD</span>
              </span>
              <button
                type="button"
                onClick={() => handleDelete(frais.id)}
                disabled={deletingId === frais.id}
                aria-label={`Supprimer ${frais.description}`}
                className="text-ink-disabled hover:text-danger disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 font-mono text-sm font-bold text-ink" data-testid={`total-frais-maintenance-${sejourId}`}>
        Total frais de maintenance : {total.toFixed(2)} MAD
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          aria-label="Description"
          className="min-w-0 flex-1 rounded-field border border-border-default px-3 py-1.5 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          placeholder="Prix"
          aria-label="Prix"
          className="w-24 rounded-field border border-border-default px-3 py-1.5 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={submitting}
          className="rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {submitting ? 'Ajout...' : '+ Ajouter'}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
