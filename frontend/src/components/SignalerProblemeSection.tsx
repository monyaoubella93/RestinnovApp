import { useRef, useState } from 'react'
import type { SignalerProblemeInput } from '../api'

interface SignalerProblemeSectionProps {
  missionMenageId: number
  onSignaler: (missionMenageId: number, input: SignalerProblemeInput) => Promise<void>
}

type RecordingState = 'idle' | 'recording' | 'recorded'

export function SignalerProblemeSection({ missionMenageId, onSignaler }: SignalerProblemeSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Recording requires MediaRecorder + getUserMedia, which aren't always
  // available (older browsers, non-HTTPS contexts, denied permissions,
  // headless test environments) -- feature-detect and degrade gracefully
  // instead of letting the mic button crash the page.
  const micSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const resetForm = () => {
    setPhoto(null)
    setPhotoPreviewUrl(null)
    setDescription('')
    setAudioFile(null)
    setAudioPreviewUrl(null)
    setRecordingState('idle')
    setError(null)
  }

  const handlePhotoChange = (file: File | undefined | null) => {
    if (!file) return
    setPhoto(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const file = new File([blob], 'signalement-audio.webm', { type: blob.type })
        setAudioFile(file)
        setAudioPreviewUrl(URL.createObjectURL(file))
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingState('recording')
    } catch {
      setError("Impossible d'accéder au micro.")
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecordingState('recorded')
  }

  const resetAudio = () => {
    setAudioFile(null)
    setAudioPreviewUrl(null)
    setRecordingState('idle')
  }

  const handleSubmit = async () => {
    setError(null)

    if (!photo && !audioFile && !description.trim()) {
      setError('Ajoutez au moins une photo, un audio ou une description.')
      return
    }

    setSubmitting(true)
    try {
      await onSignaler(missionMenageId, {
        photo,
        audio: audioFile,
        description: description.trim() ? description : null,
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
      <div className="rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            setSent(false)
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-danger px-4 py-3 text-base font-bold text-white hover:brightness-110"
        >
          <span aria-hidden="true" className="text-2xl">
            ⚠️
          </span>
          Signaler un problème
        </button>
        {sent && (
          <p
            className="mt-2 flex items-center gap-2 text-sm font-medium text-success-text"
            data-testid="signalement-confirmation"
          >
            <span aria-hidden="true" className="text-lg">
              ✅
            </span>
            Signalement envoyé au Manager
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
      <h4 className="text-base font-bold text-ink">Signaler un problème</h4>

      <div className="flex justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Ouvrir l'appareil photo"
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-4xl hover:brightness-95"
          >
            📷
          </button>
          <span className="text-xs font-medium text-ink-tertiary">Photo</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            aria-label="Photo du problème"
            onChange={(e) => handlePhotoChange(e.target.files?.[0])}
          />
          {photoPreviewUrl && (
            <img src={photoPreviewUrl} alt="Aperçu de la photo" className="mt-1 h-20 w-20 rounded-lg object-cover" />
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
                aria-label="Enregistrer un message audio"
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-4xl hover:brightness-95"
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
                data-testid="recording-indicator"
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-danger text-3xl text-white"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 animate-ping rounded-full bg-danger opacity-75"
                />
                <span aria-hidden="true" className="relative">
                  ⏹
                </span>
              </button>
              <span className="text-xs font-medium text-danger">Enregistrement...</span>
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
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border-default text-xl hover:bg-table-header-bg"
              >
                🔄
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor={`signalement_description_${missionMenageId}`}
          className="block text-sm font-semibold text-ink-secondary"
        >
          Description (optionnel)
        </label>
        <textarea
          id={`signalement_description_${missionMenageId}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-success px-4 py-2 text-base font-bold text-white hover:brightness-110 disabled:opacity-50"
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
