import { useRef, useState } from 'react'
import { resolveStorageUrl } from '../api'
import type { ProduitCatalogue } from '../types'

interface CatalogueProduitsSectionProps {
  catalogue: ProduitCatalogue[]
  onCreate: (input: { nom: string; prix: number; photo?: File | null }) => Promise<void>
}

export function CatalogueProduitsSection({ catalogue, onCreate }: CatalogueProduitsSectionProps) {
  const [nom, setNom] = useState('')
  const [prix, setPrix] = useState('0')
  const [photo, setPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    setError(null)
    if (!nom.trim()) {
      setError('Le nom est obligatoire.')
      return
    }

    setSubmitting(true)
    try {
      await onCreate({ nom, prix: Number(prix) || 0, photo })
      setNom('')
      setPrix('0')
      setPhoto(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Catalogue de produits de ménage</h2>

      <ul className="mt-3 space-y-1">
        {catalogue.map((produit) => (
          <li key={produit.id} className="flex items-center justify-between text-sm text-ink-secondary">
            <span className="flex items-center gap-2">
              {produit.photo_url && (
                <img
                  src={resolveStorageUrl(produit.photo_url)}
                  alt={`Photo de "${produit.nom}"`}
                  className="h-8 w-8 rounded object-cover"
                />
              )}
              {produit.nom} — {Number(produit.prix).toFixed(2)} MAD
            </span>
            <span
              className={`rounded-badge px-2 py-0.5 text-xs font-bold ${
                produit.actif ? 'bg-success-bg text-success-text' : 'bg-table-header-bg text-ink-tertiary'
              }`}
            >
              {produit.actif ? 'Actif' : 'Inactif'}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-light pt-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="nouveau_produit_nom" className="block text-sm font-semibold text-ink-secondary">
            Nom du produit
          </label>
          <input
            id="nouveau_produit_nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div className="w-28">
          <label htmlFor="nouveau_produit_prix" className="block text-sm font-semibold text-ink-secondary">
            Prix (MAD)
          </label>
          <input
            id="nouveau_produit_prix"
            type="number"
            min="0"
            step="0.01"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="nouveau_produit_photo" className="block text-sm font-semibold text-ink-secondary">
            Photo (optionnel)
          </label>
          <input
            ref={fileInputRef}
            id="nouveau_produit_photo"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-field bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {submitting ? 'Ajout...' : '+ Ajouter'}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
