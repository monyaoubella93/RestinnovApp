import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SignalerProblemeInput } from '../api'
import { useAudioRecorder, MAX_RECORDING_SECONDS } from '../hooks/useAudioRecorder'
import { RecordingIndicator } from './RecordingIndicator'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

interface SignalerProblemeSectionProps {
  missionMenageId: number
  onSignaler: (missionMenageId: number, input: SignalerProblemeInput) => Promise<void>
}

export function SignalerProblemeSection({ missionMenageId, onSignaler }: SignalerProblemeSectionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

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
    filename: 'signalement-audio.webm',
    micErrorMessage: t('menage.signalerProbleme.micError'),
  })

  const resetForm = () => {
    setPhoto(null)
    setPhotoPreviewUrl(null)
    setDescription('')
    resetAudio()
    setError(null)
  }

  const handlePhotoChange = (file: File | undefined | null) => {
    if (!file) return
    setPhoto(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setError(null)

    if (!photo && !audioFile && !description.trim()) {
      setError(t('menage.signalerProbleme.atLeastOne'))
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
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: photo
            ? t('menage.signalerProbleme.photoTooLarge')
            : t('menage.signalerProbleme.audioTooLarge'),
          generic: t('common.genericError'),
        }),
      )
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
          {t('menage.signalerProbleme.button')}
        </button>
        {sent && (
          <p
            className="mt-2 flex items-center gap-2 text-sm font-medium text-success-text"
            data-testid="signalement-confirmation"
          >
            <span aria-hidden="true" className="text-lg">
              ✅
            </span>
            {t('menage.signalerProbleme.sentConfirmation')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
      <h4 className="text-base font-bold text-ink">{t('menage.signalerProbleme.button')}</h4>

      <div className="flex justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t('menage.signalerProbleme.openCamera')}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-4xl hover:brightness-95"
          >
            📷
          </button>
          <span className="text-xs font-medium text-ink-tertiary">{t('menage.signalerProbleme.photoCaption')}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            aria-label={t('menage.signalerProbleme.photoAlt')}
            onChange={(e) => handlePhotoChange(e.target.files?.[0])}
          />
          {photoPreviewUrl && (
            <img
              src={photoPreviewUrl}
              alt={t('menage.signalerProbleme.previewAlt')}
              className="mt-1 h-20 w-20 rounded-lg object-cover"
            />
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          {!micSupported ? (
            <p className="max-w-[6rem] text-center text-xs text-ink-disabled">
              {t('menage.signalerProbleme.audioUnavailable')}
            </p>
          ) : recordingState === 'idle' ? (
            <>
              <button
                type="button"
                onClick={startRecording}
                aria-label={t('menage.signalerProbleme.recordAudio')}
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-danger-border bg-danger-bg text-4xl hover:brightness-95"
              >
                🎤
              </button>
              <span className="text-xs font-medium text-ink-tertiary">{t('menage.signalerProbleme.audioCaption')}</span>
            </>
          ) : recordingState === 'recording' ? (
            <>
              <button
                type="button"
                onClick={stopRecording}
                aria-label={t('menage.signalerProbleme.stopRecording')}
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
              <span className="text-xs font-medium text-danger">{t('menage.signalerProbleme.recording')}</span>
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
                aria-label={t('menage.signalerProbleme.restartRecording')}
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
          {t('menage.signalerProbleme.descriptionLabel')}
        </label>
        <textarea
          id={`signalement_description_${missionMenageId}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      {(error || micError) && (
        <p className="flex items-center gap-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠️</span>
          {error || micError}
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
          {t('common.cancel')}
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
          {submitting ? t('common.sending') : t('common.send')}
        </button>
      </div>
    </div>
  )
}
