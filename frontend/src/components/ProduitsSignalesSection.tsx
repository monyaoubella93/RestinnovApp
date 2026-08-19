import { useState } from 'react'
import { resolveStorageUrl } from '../api'
import type { ProduitMenageSignale } from '../types'

interface ProduitsSignalesSectionProps {
  produitsSignales: ProduitMenageSignale[]
  onValider: (id: number, input: { nom: string; prix: number }) => Promise<void>
  onRejeter: (id: number) => Promise<void>
}

export function ProduitSignaleCard({
  produitSignale,
  onValider,
  onRejeter,
}: {
  produitSignale: ProduitMenageSignale
  onValider: (id: number, input: { nom: string; prix: number }) => Promise<void>
  onRejeter: (id: number) => Promise<void>
}) {
  const [nom, setNom] = useState('')
  const [prix, setPrix] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleValider = async () => {
    setError(null)
    if (!nom.trim() || !prix) {
      setError('Le nom et le prix sont obligatoires.')
      return
    }

    setSubmitting(true)
    try {
      await onValider(produitSignale.id, { nom, prix: Number(prix) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRejeter = async () => {
    setSubmitting(true)
    try {
      await onRejeter(produitSignale.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="rounded-field border border-border-default p-3">
      <img
        src={resolveStorageUrl(produitSignale.photo_url)}
        alt="Produit signalé"
        className="h-32 w-32 rounded-md object-cover"
      />
      {produitSignale.note && <p className="mt-1 text-sm text-ink-secondary">Note : {produitSignale.note}</p>}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`valider_nom_${produitSignale.id}`} className="block text-xs font-semibold text-ink-secondary">
            Nom
          </label>
          <input
            id={`valider_nom_${produitSignale.id}`}
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div className="w-28">
          <label htmlFor={`valider_prix_${produitSignale.id}`} className="block text-xs font-semibold text-ink-secondary">
            Prix (MAD)
          </label>
          <input
            id={`valider_prix_${produitSignale.id}`}
            type="number"
            min="0"
            step="0.01"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleValider}
          disabled={submitting}
          className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          Valider
        </button>
        <button
          type="button"
          onClick={handleRejeter}
          disabled={submitting}
          className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
        >
          Rejeter
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </li>
  )
}

export function ProduitsSignalesSection({
  produitsSignales,
  onValider,
  onRejeter,
}: ProduitsSignalesSectionProps) {
  return (
    <div className="rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        Produits signalés en attente
        <span className="rounded-badge bg-warning-bg px-2 py-0.5 text-xs font-bold text-warning-text">
          {produitsSignales.length}
        </span>
      </h2>

      {produitsSignales.length === 0 ? (
        <p className="mt-2 text-sm text-ink-tertiary">Aucun produit signalé en attente.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {produitsSignales.map((produitSignale) => (
            <ProduitSignaleCard
              key={produitSignale.id}
              produitSignale={produitSignale}
              onValider={onValider}
              onRejeter={onRejeter}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
