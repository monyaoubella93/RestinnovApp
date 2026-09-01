import { useRef, useState } from 'react'
import type { AjouterPhotosPreuveInput } from '../api'

interface PhotoPreuveSectionProps {
  missionMenageId: number
  onAjouter: (missionMenageId: number, input: AjouterPhotosPreuveInput) => Promise<void>
  /** Emphasized presentation: shown auto-expanded and highlighted, for a mission just sent back by the Manager. */
  misEnAvant?: boolean
}

interface PhotoEntry {
  file: File
  previewUrl: string
}

export function PhotoPreuveSection({ missionMenageId, onAjouter, misEnAvant = false }: PhotoPreuveSectionProps) {
  const [expanded, setExpanded] = useState(misEnAvant)
  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setPhotos([])
    setNote('')
    setError(null)
  }

  const handlePhotosChange = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const entries = Array.from(files).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setPhotos((current) => [...current, ...entries])
  }

  const removePhoto = (index: number) => {
    setPhotos((current) => current.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    setError(null)

    if (photos.length === 0) {
      setError('Ajoutez au moins une photo.')
      return
    }

    setSubmitting(true)
    try {
      await onAjouter(missionMenageId, {
        photos: photos.map((p) => p.file),
        note: note.trim() ? note : null,
      })
      resetForm()
      setExpanded(false)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return (
      <div
        className={`rounded-card-agent-lg border-2 p-4 ${
          misEnAvant ? 'border-brand-light bg-brand-pale' : 'border-border-default bg-surface'
        }`}
      >
        {misEnAvant && (
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand">
            <span aria-hidden="true" className="text-lg">
              💡
            </span>
            Mission refusée : montrez au Manager le travail corrigé.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            setSent(false)
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-bold text-white hover:bg-brand-light"
        >
          <span aria-hidden="true" className="text-2xl">
            📸
          </span>
          Ajouter une photo de mon travail
        </button>
        {sent && (
          <p
            className="mt-2 flex items-center gap-2 text-sm font-medium text-success-text"
            data-testid="photo-preuve-confirmation"
          >
            <span aria-hidden="true" className="text-lg">
              ✅
            </span>
            Photo(s) envoyée(s) au Manager
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-card-agent-lg border-2 border-brand-border bg-surface p-4">
      <h4 className="text-base font-bold text-ink">Ajouter une photo de mon travail</h4>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Ouvrir l'appareil photo"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-brand-border bg-brand-pale text-4xl hover:brightness-95"
        >
          📷
        </button>
        <span className="text-xs font-medium text-ink-tertiary">Photo(s)</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          aria-label="Photos de preuve de travail"
          onChange={(e) => {
            handlePhotosChange(e.target.files)
            e.target.value = ''
          }}
        />

        {photos.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {photos.map((photo, index) => (
              <div key={photo.previewUrl} className="relative">
                <img
                  src={photo.previewUrl}
                  alt={`Aperçu photo de preuve ${index + 1}`}
                  className="h-20 w-20 rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  aria-label={`Retirer la photo ${index + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-xs font-bold text-white hover:brightness-110"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`photo_preuve_note_${missionMenageId}`} className="block text-sm font-semibold text-ink-secondary">
          Note (optionnel)
        </label>
        <textarea
          id={`photo_preuve_note_${missionMenageId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠️</span>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            resetForm()
            setExpanded(false)
          }}
          className="min-h-14 flex-1 rounded-xl border-2 border-border-default px-4 py-2 text-base font-medium text-ink-secondary hover:bg-table-header-bg"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-base font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          <span aria-hidden="true" className="text-xl">
            ✓
          </span>
          {submitting ? 'Envoi...' : 'Envoyer'}
        </button>
      </div>
    </div>
  )
}
