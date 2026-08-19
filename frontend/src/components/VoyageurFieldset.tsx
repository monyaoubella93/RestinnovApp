import type { Voyageur } from '../types'

interface VoyageurFieldsetProps {
  voyageur: Voyageur
  index: number
  canRemove: boolean
  onChange: (patch: Partial<Voyageur>) => void
  onSetPrincipal: () => void
  onRemove: () => void
}

const TYPE_LABELS: Record<Voyageur['type'], string> = {
  adulte: 'Adulte',
  enfant: 'Enfant',
}

const TYPE_STYLES: Record<Voyageur['type'], string> = {
  adulte: 'bg-brand-pale text-brand',
  enfant: 'bg-warning-bg text-warning-text',
}

export function VoyageurFieldset({
  voyageur,
  index,
  canRemove,
  onChange,
  onSetPrincipal,
  onRemove,
}: VoyageurFieldsetProps) {
  return (
    <div className="relative rounded-field border border-border-default p-3">
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer le voyageur ${index + 1}`}
          className="absolute right-2 top-2 text-ink-disabled hover:text-danger"
        >
          ✕
        </button>
      )}

      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold text-ink-secondary">Voyageur {index + 1}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[voyageur.type]}`}>
          {TYPE_LABELS[voyageur.type]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`voyageur_nom_${index}`} className="block text-xs font-semibold text-ink-secondary">
            Nom
          </label>
          <input
            id={`voyageur_nom_${index}`}
            type="text"
            required
            value={voyageur.nom}
            onChange={(e) => onChange({ nom: e.target.value })}
            placeholder="Nom du voyageur"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`voyageur_passeport_${index}`} className="block text-xs font-semibold text-ink-secondary">
            Numéro de passeport
          </label>
          <input
            id={`voyageur_passeport_${index}`}
            type="text"
            value={voyageur.numero_passeport ?? ''}
            onChange={(e) => onChange({ numero_passeport: e.target.value })}
            placeholder="Optionnel"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`voyageur_telephone_${index}`} className="block text-xs font-semibold text-ink-secondary">
            Téléphone
          </label>
          <input
            id={`voyageur_telephone_${index}`}
            type="tel"
            value={voyageur.telephone ?? ''}
            onChange={(e) => onChange({ telephone: e.target.value })}
            placeholder="Optionnel"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
      </div>

      {voyageur.type === 'adulte' && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={voyageur.est_principal}
            onChange={onSetPrincipal}
            className="h-4 w-4 rounded border-border-default accent-brand"
          />
          Voyageur principal
        </label>
      )}
    </div>
  )
}
