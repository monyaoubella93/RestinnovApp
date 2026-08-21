import { useRef, useState } from 'react'
import { useAudioRecorder, MAX_RECORDING_SECONDS } from '../hooks/useAudioRecorder'
import { RecordingIndicator } from './RecordingIndicator'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

export interface RefuserModalConfirmInput {
  motif: string | null
  motifAudio: File | null
  motifPhoto: File | null
}

interface RefuserModalProps {
  title: string
  onCancel: () => void
  onConfirm: (input: RefuserModalConfirmInput) => Promise<void>
}

/**
 * Shared Manager-facing "Refuser" modal, used for both mission de ménage
 * and ticket de maintenance refusals so the motif can be text, audio,
 * and/or photo (at least one) on both sides -- mirrors
 * SignalerProblemeSection's audio-capture pattern.
 */
export function RefuserModal({ title, onCancel, onConfirm }: RefuserModalProps) {
  const [motif, setMotif] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    recordingState,
    audioFile,
    audioPreviewUrl,
    elapsedSeconds,
    error: micError,
    micSupported,
    startRecording,
    stopRecording,
    resetAudio,
  } = useAudioRecorder({
    filename: 'refus-audio.webm',
    micErrorMessage: "Impossible d'accéder au micro.",
  })

  const handlePhotoChange = (file: File | undefined | null) => {
    if (!file) return
    setPhoto(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const handleConfirm = async () => {
    setError(null)

    if (!motif.trim() && !audioFile && !photo) {
      setError('Fournissez un motif texte, audio ou photo.')
      return
    }

    setSubmitting(true)
    try {
      await onConfirm({
        motif: motif.trim() ? motif.trim() : null,
        motifAudio: audioFile,
        motifPhoto: photo,
      })
    } catch (err) {
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: photo
            ? 'Photo trop lourde, réessayez avec une photo plus légère.'
            : 'Enregistrement audio trop lourd, recommencez un enregistrement plus court.',
          generic: 'Une erreur est survenue.',
        }),
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-card-manager bg-surface p-5 shadow-lg">
        <h3 className="text-base font-bold text-ink">{title}</h3>

        <div className="mt-3">
          <label htmlFor="refuser_motif" className="block text-sm font-semibold text-ink-secondary">
            Motif du refus (texte)
          </label>
          <textarea
            id="refuser_motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            placeholder="Expliquez pourquoi ce n'est pas accepté..."
          />
        </div>

        <div className="mt-4 flex justify-center gap-8">
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Ajouter une photo au motif de refus"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-3xl hover:brightness-95"
            >
              📷
            </button>
            <span className="text-xs font-medium text-ink-tertiary">Photo</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              aria-label="Photo du motif de refus"
              onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            />
            {photoPreviewUrl && (
              <img src={photoPreviewUrl} alt="Aperçu de la photo" className="mt-1 h-16 w-16 rounded-lg object-cover" />
            )}
          </div>

          <div className="flex flex-col items-center gap-1">
            {!micSupported ? (
              <p className="max-w-[6rem] text-center text-xs text-ink-disabled">Audio non disponible</p>
            ) : recordingState === 'idle' ? (
              <>
                <button
                  type="button"
                  onClick={startRecording}
                  aria-label="Enregistrer un message audio pour le motif de refus"
                  className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-3xl hover:brightness-95"
                >
                  🎤
                </button>
                <span className="text-xs font-medium text-ink-tertiary">Audio</span>
              </>
            ) : recordingState === 'recording' ? (
              <>
                <button
                  type="button"
                  onClick={stopRecording}
                  aria-label="Arrêter l'enregistrement"
                  data-testid="refus-recording-indicator"
                  className="relative flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl text-white"
                >
                  <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-danger opacity-75" />
                  <span aria-hidden="true" className="relative">
                    ⏹
                  </span>
                </button>
                <span className="text-xs font-medium text-danger">Enregistrement...</span>
                <RecordingIndicator elapsedSeconds={elapsedSeconds} maxSeconds={MAX_RECORDING_SECONDS} />
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {audioPreviewUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls src={audioPreviewUrl} className="w-40" />
                )}
                <button
                  type="button"
                  onClick={resetAudio}
                  aria-label="Recommencer l'enregistrement audio"
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border-default text-lg hover:bg-table-header-bg"
                >
                  🔄
                </button>
              </div>
            )}
          </div>
        </div>

        {(error || micError) && <p className="mt-3 text-sm text-danger">{error || micError}</p>}

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
            onClick={handleConfirm}
            disabled={submitting || (!motif.trim() && !audioFile && !photo)}
            className="rounded-field bg-danger px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? 'Envoi...' : 'Confirmer le refus'}
          </button>
        </div>
      </div>
    </div>
  )
}
