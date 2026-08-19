import { useEffect, useState, type FormEvent } from 'react'
import type { NewSejourInput } from '../api'
import type { Appartement, PlateformeOrigine, Sejour, Voyageur, VoyageurType } from '../types'
import { VoyageurFieldset } from './VoyageurFieldset'

interface NouveauSejourFormProps {
  appartements: Appartement[]
  onSubmit: (input: NewSejourInput) => Promise<void>
  onCancel?: () => void
  sejourToEdit?: Sejour | null
}

const PLATEFORMES: { value: PlateformeOrigine; label: string }[] = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking' },
  { value: 'direct', label: 'Direct' },
  { value: 'autre', label: 'Autre' },
]

function computeNombreNuits(dateArrivee: string, dateDepart: string): number | null {
  if (!dateArrivee || !dateDepart) return null
  const start = new Date(dateArrivee)
  const end = new Date(dateDepart)
  const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return nights > 0 ? nights : null
}

function defaultVoyageurs(): Voyageur[] {
  return [{ nom: '', numero_passeport: '', telephone: '', est_principal: true, type: 'adulte' }]
}

/** Removes the voyageur at `index`, reassigning "principal" to the first remaining adulte if needed. */
function removeAtIndex(list: Voyageur[], index: number): Voyageur[] {
  const removed = list[index]
  const next = list.filter((_, i) => i !== index)
  if (removed.est_principal) {
    const firstAdulteIndex = next.findIndex((v) => v.type === 'adulte')
    if (firstAdulteIndex !== -1) {
      next[firstAdulteIndex] = { ...next[firstAdulteIndex], est_principal: true }
    }
  }
  return next
}

export function NouveauSejourForm({ appartements, onSubmit, onCancel, sejourToEdit }: NouveauSejourFormProps) {
  // "maintenance" means an unresolved problem -- no new (or edited) booking
  // can go on it until it's resolved, so it never appears as a choice here.
  // The backend enforces the same rule on save as a defense-in-depth guard.
  const appartementsSelectionnables = appartements.filter((a) => a.statut !== 'maintenance')

  const [appartementId, setAppartementId] = useState('')
  const [dateArrivee, setDateArrivee] = useState('')
  const [dateDepart, setDateDepart] = useState('')
  const [plateformeOrigine, setPlateformeOrigine] = useState<PlateformeOrigine>('airbnb')
  const [montantMad, setMontantMad] = useState('0')
  const [voyageurs, setVoyageurs] = useState<Voyageur[]>(defaultVoyageurs())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setAppartementId('')
    setDateArrivee('')
    setDateDepart('')
    setPlateformeOrigine('airbnb')
    setMontantMad('0')
    setVoyageurs(defaultVoyageurs())
    setError(null)
  }

  useEffect(() => {
    if (sejourToEdit) {
      setAppartementId(String(sejourToEdit.appartement_id))
      setDateArrivee(sejourToEdit.date_arrivee)
      setDateDepart(sejourToEdit.date_depart)
      setPlateformeOrigine(sejourToEdit.plateforme_origine)
      setMontantMad(String(sejourToEdit.montant_mad ?? 0))
      setVoyageurs(
        sejourToEdit.voyageurs && sejourToEdit.voyageurs.length > 0
          ? sejourToEdit.voyageurs.map((v) => ({ ...v }))
          : defaultVoyageurs(),
      )
      setError(null)
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sejourToEdit])

  const updateVoyageur = (index: number, patch: Partial<Voyageur>) => {
    setVoyageurs((current) => current.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  const setPrincipal = (index: number) => {
    setVoyageurs((current) => current.map((v, i) => ({ ...v, est_principal: i === index })))
  }

  const addVoyageur = (type: VoyageurType) => {
    setVoyageurs((current) => [
      ...current,
      { nom: '', numero_passeport: '', telephone: '', est_principal: false, type },
    ])
  }

  const removeVoyageur = (index: number) => {
    setVoyageurs((current) => {
      const voyageur = current[index]
      if (voyageur.type === 'adulte' && current.filter((v) => v.type === 'adulte').length <= 1) {
        return current
      }
      return removeAtIndex(current, index)
    })
  }

  const removeLastOfType = (type: VoyageurType) => {
    setVoyageurs((current) => {
      let lastIndex = -1
      for (let i = current.length - 1; i >= 0; i -= 1) {
        if (current[i].type === type) {
          lastIndex = i
          break
        }
      }
      if (lastIndex === -1) return current
      if (type === 'adulte' && current.filter((v) => v.type === 'adulte').length <= 1) return current
      return removeAtIndex(current, lastIndex)
    })
  }

  const adultesCount = voyageurs.filter((v) => v.type === 'adulte').length
  const enfantsCount = voyageurs.filter((v) => v.type === 'enfant').length

  const nombreNuits = computeNombreNuits(dateArrivee, dateDepart)
  const montantParNuit = nombreNuits ? (Number(montantMad) || 0) / nombreNuits : null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const id = Number(appartementId)
    if (!id) {
      setError('Veuillez choisir un appartement.')
      return
    }

    if (dateArrivee && dateDepart && dateDepart <= dateArrivee) {
      setError("La date de départ doit être strictement après la date d'arrivée.")
      return
    }

    if (voyageurs.some((v) => !v.nom.trim())) {
      setError('Le nom est obligatoire pour chaque voyageur.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        appartement_id: id,
        date_arrivee: dateArrivee,
        date_depart: dateDepart,
        plateforme_origine: plateformeOrigine,
        montant_mad: Number(montantMad) || 0,
        voyageurs: voyageurs.map((v) => ({
          nom: v.nom,
          numero_passeport: v.numero_passeport?.trim() ? v.numero_passeport : null,
          telephone: v.telephone?.trim() ? v.telephone : null,
          est_principal: v.est_principal,
          type: v.type,
        })),
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
      <h2 className="text-lg font-bold text-ink">
        {sejourToEdit ? 'Modifier le séjour' : 'Nouveau séjour'}
      </h2>

      <div>
        <label htmlFor="appartement_id" className="block text-sm font-semibold text-ink-secondary">
          Appartement
        </label>
        {appartementsSelectionnables.length > 0 ? (
          <select
            id="appartement_id"
            value={appartementId}
            onChange={(e) => setAppartementId(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Sélectionner un appartement</option>
            {appartementsSelectionnables.map((appartement) => (
              <option key={appartement.id} value={appartement.id}>
                {appartement.nom}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="appartement_id"
            type="number"
            min="1"
            value={appartementId}
            onChange={(e) => setAppartementId(e.target.value)}
            placeholder="ID de l'appartement"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date_arrivee" className="block text-sm font-semibold text-ink-secondary">
            Date d'arrivée
          </label>
          <input
            id="date_arrivee"
            type="date"
            required
            value={dateArrivee}
            onChange={(e) => setDateArrivee(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="date_depart" className="block text-sm font-semibold text-ink-secondary">
            Date de départ
          </label>
          <input
            id="date_depart"
            type="date"
            required
            value={dateDepart}
            onChange={(e) => setDateDepart(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
      </div>

      {nombreNuits !== null && (
        <p className="text-sm text-ink-tertiary" data-testid="nombre-nuits">
          {nombreNuits} {nombreNuits > 1 ? 'nuits' : 'nuit'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="block text-sm font-semibold text-ink-secondary">Adultes</span>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => removeLastOfType('adulte')}
              disabled={adultesCount <= 1}
              aria-label="Diminuer le nombre d'adultes"
              className="h-8 w-8 rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium" data-testid="nombre-adultes">
              {adultesCount}
            </span>
            <button
              type="button"
              onClick={() => addVoyageur('adulte')}
              aria-label="Augmenter le nombre d'adultes"
              className="h-8 w-8 rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <span className="block text-sm font-semibold text-ink-secondary">Enfants</span>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => removeLastOfType('enfant')}
              disabled={enfantsCount <= 0}
              aria-label="Diminuer le nombre d'enfants"
              className="h-8 w-8 rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg disabled:opacity-50"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium" data-testid="nombre-enfants">
              {enfantsCount}
            </span>
            <button
              type="button"
              onClick={() => addVoyageur('enfant')}
              aria-label="Augmenter le nombre d'enfants"
              className="h-8 w-8 rounded-field border border-border-default text-ink-secondary hover:bg-table-header-bg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div>
        <span className="block text-sm font-semibold text-ink-secondary">Plateforme d'origine</span>
        <div className="mt-1 flex gap-2" role="group" aria-label="Plateforme d'origine">
          {PLATEFORMES.map((plateforme) => (
            <button
              key={plateforme.value}
              type="button"
              aria-pressed={plateformeOrigine === plateforme.value}
              onClick={() => setPlateformeOrigine(plateforme.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                plateformeOrigine === plateforme.value
                  ? 'bg-brand text-white'
                  : 'bg-table-header-bg text-ink-secondary hover:bg-border-light'
              }`}
            >
              {plateforme.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="montant_mad" className="block text-sm font-semibold text-ink-secondary">
          Montant du séjour (MAD)
        </label>
        <input
          id="montant_mad"
          type="number"
          min="0"
          step="0.01"
          value={montantMad}
          onChange={(e) => setMontantMad(e.target.value)}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {montantParNuit !== null && (
          <p className="mt-1 text-sm text-ink-tertiary" data-testid="montant-par-nuit">
            Soit {montantParNuit.toFixed(2)} MAD / nuit
          </p>
        )}
      </div>

      <div>
        <p className="text-sm text-ink-tertiary" data-testid="resume-voyageurs">
          {adultesCount + enfantsCount} voyageurs ({adultesCount} adultes, {enfantsCount} enfants)
        </p>
        <span className="mt-2 block text-sm font-semibold text-ink-secondary">Voyageurs</span>
        <div className="mt-2 space-y-3">
          {voyageurs.map((voyageur, index) => (
            <VoyageurFieldset
              key={index}
              voyageur={voyageur}
              index={index}
              canRemove={voyageur.type === 'enfant' || adultesCount > 1}
              onChange={(patch) => updateVoyageur(index, patch)}
              onSetPrincipal={() => setPrincipal(index)}
              onRemove={() => removeVoyageur(index)}
            />
          ))}
        </div>
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
          {submitting
            ? 'Enregistrement...'
            : sejourToEdit
              ? 'Enregistrer les modifications'
              : 'Enregistrer le séjour'}
        </button>
      </div>
    </form>
  )
}
