import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  commencerTicketMaintenance,
  envoyerMessageAgentMaintenance,
  marquerTicketMaintenanceRefusVu,
  resoudreTicketMaintenance,
  resolveStorageUrl,
} from '../api'
import type { MessageAgentMaintenance, MonTicketMaintenance } from '../types'
import { EN_RETARD_STYLE, formatDateLimite, URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'
import { friendlyUploadErrorMessage } from '../utils/uploadError'
import { useAudioRecorder, MAX_RECORDING_SECONDS } from '../hooks/useAudioRecorder'
import { RecordingIndicator } from './RecordingIndicator'

interface TicketDetailAgentProps {
  ticket: MonTicketMaintenance
  onBack: () => void
  onResolu: () => void
  onCommence: () => void
}

/**
 * Lets the assigned agent send the Manager an intermediate photo/audio/note
 * on a ticket that's still in progress -- distinct from the final
 * resoudre() proof below, this is for clarifying or asking a question
 * before or during the repair. Only shown while the ticket is actually on
 * this agent's plate (assigne/a_refaire), matching the backend precondition.
 */
interface PhotoEntry {
  file: File
  previewUrl: string
}

function MessageAgentSection({ ticket }: { ticket: MonTicketMaintenance }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentMessages, setSentMessages] = useState<MessageAgentMaintenance[]>(ticket.messages_agent ?? [])
  const [justSent, setJustSent] = useState(false)

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
    filename: 'message-agent-maintenance.webm',
    micErrorMessage: t('maintenance.detail.message.micError'),
  })

  const resetForm = () => {
    setPhotos([])
    setNote('')
    resetAudio()
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

    if (photos.length === 0 && !audioFile && !note.trim()) {
      setError(t('maintenance.detail.message.atLeastOne'))
      return
    }

    setSubmitting(true)
    try {
      const updated = await envoyerMessageAgentMaintenance(ticket.id, {
        photos: photos.map((p) => p.file),
        audio: audioFile,
        note: note.trim() ? note : null,
      })
      setSentMessages(updated.messages_agent ?? [])
      resetForm()
      setExpanded(false)
      setJustSent(true)
    } catch (err) {
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: photos.length > 0 ? t('maintenance.detail.message.photoTooLarge') : t('maintenance.detail.message.audioTooLarge'),
          generic: t('common.genericError'),
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
      {sentMessages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-secondary">{t('maintenance.detail.message.historyTitle')}</p>
          <ul className="space-y-2">
            {sentMessages.map((message) => (
              <li key={message.id} className="space-y-1 rounded-field bg-table-header-bg p-2 text-sm text-ink-secondary">
                {message.note && <p>{message.note}</p>}
                {message.audio_url && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls src={resolveStorageUrl(message.audio_url)} className="w-full" />
                )}
                {(message.photo_url || (message.photos_supplementaires?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {message.photo_url && (
                      <img
                        src={resolveStorageUrl(message.photo_url)}
                        alt={t('maintenance.detail.message.photoAlt')}
                        className="h-20 w-20 rounded object-cover"
                      />
                    )}
                    {message.photos_supplementaires?.map((photo) => (
                      <img
                        key={photo.id}
                        src={resolveStorageUrl(photo.photo_url)}
                        alt={t('maintenance.detail.message.photoAlt')}
                        className="h-20 w-20 rounded object-cover"
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(true)
            setJustSent(false)
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-border bg-brand-pale px-4 py-3 text-base font-bold text-brand hover:brightness-95"
        >
          <span aria-hidden="true" className="text-xl">
            💬
          </span>
          {t('maintenance.detail.message.button')}
        </button>
      ) : (
        <div className="space-y-4">
          <h4 className="text-base font-bold text-ink">{t('maintenance.detail.message.button')}</h4>

          <div className="flex justify-center gap-8">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('maintenance.detail.message.openCamera')}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-brand-border bg-brand-pale text-3xl hover:brightness-95"
              >
                📷
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                aria-label={t('maintenance.detail.message.photoAlt')}
                onChange={(e) => {
                  handlePhotosChange(e.target.files)
                  e.target.value = ''
                }}
              />
              {photos.length > 0 && (
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {photos.map((photo, index) => (
                    <div key={photo.previewUrl} className="relative">
                      <img
                        src={photo.previewUrl}
                        alt={t('maintenance.detail.message.previewAlt', { index: index + 1 })}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={t('maintenance.detail.message.removePhoto', { index: index + 1 })}
                        className="absolute -end-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-xs font-bold text-white hover:brightness-110"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              {!micSupported ? (
                <p className="max-w-[6rem] text-center text-xs text-ink-disabled">
                  {t('maintenance.detail.message.audioUnavailable')}
                </p>
              ) : recordingState === 'idle' ? (
                <button
                  type="button"
                  onClick={startRecording}
                  aria-label={t('maintenance.detail.message.recordAudio')}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-brand-border bg-brand-pale text-3xl hover:brightness-95"
                >
                  🎤
                </button>
              ) : recordingState === 'recording' ? (
                <>
                  <button
                    type="button"
                    onClick={stopRecording}
                    aria-label={t('maintenance.detail.message.stopRecording')}
                    data-testid="message-recording-indicator"
                    className="relative flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl text-white"
                  >
                    <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-danger opacity-75" />
                    <span aria-hidden="true" className="relative">
                      ⏹
                    </span>
                  </button>
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
                    aria-label={t('maintenance.detail.message.restartRecording')}
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border-default text-lg hover:bg-table-header-bg"
                  >
                    🔄
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`message_note_${ticket.id}`} className="block text-sm font-semibold text-ink-secondary">
              {t('maintenance.detail.message.noteLabel')}
            </label>
            <textarea
              id={`message_note_${ticket.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
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
              className="min-h-12 flex-1 rounded-xl border-2 border-border-default px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="min-h-12 flex-1 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
            >
              {submitting ? t('common.sending') : t('common.send')}
            </button>
          </div>
        </div>
      )}

      {justSent && (
        <p
          data-testid="message-agent-confirmation"
          className="flex items-center gap-2 text-sm font-medium text-success-text"
        >
          <span aria-hidden="true">✅</span>
          {t('maintenance.detail.message.sentConfirmation')}
        </p>
      )}
    </div>
  )
}

export function TicketDetailAgent({ ticket, onBack, onResolu, onCommence }: TicketDetailAgentProps) {
  const { t } = useTranslation()
  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const [coutReparation, setCoutReparation] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolu, setResolu] = useState(false)
  const [statutActuel, setStatutActuel] = useState(ticket.statut)
  const [commencing, setCommencing] = useState(false)
  const [commencerError, setCommencerError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ticket.statut === 'a_refaire' && ticket.refus.some((r) => !r.vu)) {
      void marquerTicketMaintenanceRefusVu(ticket.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

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
      setError(t('maintenance.detail.photoRequise'))
      return
    }
    if (!coutReparation.trim()) {
      setError(t('maintenance.detail.prixRequis'))
      return
    }

    setSubmitting(true)
    try {
      await resoudreTicketMaintenance(ticket.id, {
        photosApres: photos.map((p) => p.file),
        coutReparation: Number(coutReparation),
        note: note.trim() ? note : null,
      })
      setResolu(true)
      onResolu()
    } catch (err) {
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: t('maintenance.detail.photoTooLarge'),
          generic: t('common.genericError'),
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleCommencer = async () => {
    setCommencerError(null)
    setCommencing(true)
    try {
      await commencerTicketMaintenance(ticket.id)
      setStatutActuel('en_cours')
      onCommence()
    } catch (err) {
      setCommencerError(err instanceof Error ? err.message : t('common.genericError'))
    } finally {
      setCommencing(false)
    }
  }

  // The "envoyer un message" flow is open to the agent at every point their
  // ticket is actively on their plate -- before they've clicked "Commencer
  // le travail" (assigne), while working (en_cours), and after a Manager
  // refus sent it back (a_refaire).
  const peutEnvoyerMessage = statutActuel === 'assigne' || statutActuel === 'en_cours' || statutActuel === 'a_refaire'

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-brand-light hover:text-brand">
        {t('maintenance.detail.back')}
      </button>

      <div className="rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-ink">
              {ticket.appartement?.nom ?? t('common.apartmentFallback')}
              <span className="ms-2 font-mono text-xs font-normal text-ink-tertiary">{ticket.reference}</span>
            </p>
            <p className="text-sm text-ink-tertiary">{ticket.appartement?.adresse}</p>
          </div>
          <span
            className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${
              ticket.est_en_retard ? EN_RETARD_STYLE : URGENCE_STYLES[ticket.urgence]
            }`}
          >
            {ticket.est_en_retard
              ? t('maintenance.detail.enRetard')
              : t('maintenance.urgenceLabel', { label: URGENCE_LABELS[ticket.urgence] })}
          </span>
        </div>

        {ticket.date_limite_intervention && (
          <p className="mt-2 text-sm text-ink-tertiary">
            {t('maintenance.detail.dateLimite', { date: formatDateLimite(ticket.date_limite_intervention) })}
          </p>
        )}

        {ticket.statut === 'a_refaire' && ticket.refus.length > 0 && (
          <div data-testid="refus-banner" className="mt-3 space-y-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-semibold text-danger">
            <p className="flex items-center gap-2">
              <span aria-hidden="true">⚠️</span>
              {t('maintenance.detail.refusBanner')}
            </p>
            {ticket.refus[0].motif && <p className="font-normal">{ticket.refus[0].motif}</p>}
            {ticket.refus[0].motif_audio_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={resolveStorageUrl(ticket.refus[0].motif_audio_url)} className="w-full" />
            )}
            {ticket.refus[0].motif_photo_url && (
              <img
                src={resolveStorageUrl(ticket.refus[0].motif_photo_url)}
                alt={t('maintenance.detail.photoMotifRefus')}
                className="h-32 w-32 rounded-lg object-cover"
              />
            )}
          </div>
        )}

        {ticket.description_manager && (
          <p className="mt-3 text-sm text-ink-secondary">{ticket.description_manager}</p>
        )}

        {ticket.description_manager_audio_url && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            controls
            src={resolveStorageUrl(ticket.description_manager_audio_url)}
            className="mt-3 w-full"
          />
        )}

        {ticket.photo_url && (
          <img
            src={resolveStorageUrl(ticket.photo_url)}
            alt={t('maintenance.detail.photoProbleme')}
            className="mt-3 h-32 w-32 rounded-lg object-cover"
          />
        )}
      </div>

      {peutEnvoyerMessage && <MessageAgentSection ticket={ticket} />}

      {resolu ? (
        <div
          data-testid="resolution-confirmation"
          className="flex items-center gap-3 rounded-card-agent-lg border-2 border-success-border bg-success-bg p-4"
        >
          <span aria-hidden="true" className="text-3xl">
            ✅
          </span>
          <p className="text-base font-medium text-success-text">{t('maintenance.detail.sentForValidation')}</p>
        </div>
      ) : statutActuel === 'assigne' ? (
        <div className="space-y-3 rounded-card-agent-lg border-2 border-brand-border bg-brand-pale p-4">
          {commencerError && (
            <p className="flex items-center gap-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
              <span aria-hidden="true">⚠️</span>
              {commencerError}
            </p>
          )}
          <button
            type="button"
            onClick={handleCommencer}
            disabled={commencing}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-base font-bold text-white hover:bg-brand-light disabled:opacity-50"
          >
            {commencing ? t('maintenance.detail.commencerStarting') : t('maintenance.detail.commencerButton')}
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-card-agent-lg border-2 border-border-default bg-surface p-4">
          <h4 className="text-base font-bold text-ink">{t('maintenance.detail.marquerResolu')}</h4>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('maintenance.detail.prendrePhoto')}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-brand-border bg-brand-pale text-4xl hover:brightness-95"
            >
              📷
            </button>
            <span className="text-xs font-medium text-ink-tertiary">{t('maintenance.detail.prendrePhoto')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label={t('maintenance.detail.photoReparation')}
              onChange={(e) => {
                handlePhotosChange(e.target.files)
                e.target.value = ''
              }}
            />
            {photos.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {photos.map((photo, index) => (
                  <div key={photo.previewUrl} className="relative">
                    <img
                      src={photo.previewUrl}
                      alt={t('maintenance.detail.previewAlt', { index: index + 1 })}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      aria-label={t('maintenance.detail.removePhoto', { index: index + 1 })}
                      className="absolute -end-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-xs font-bold text-white hover:brightness-110"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="cout_reparation" className="block text-sm font-semibold text-ink-secondary">
              {t('maintenance.detail.prix')}
            </label>
            <input
              id="cout_reparation"
              type="number"
              inputMode="decimal"
              value={coutReparation}
              onChange={(e) => setCoutReparation(e.target.value)}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="note_resolution" className="block text-sm font-semibold text-ink-secondary">
              {t('common.optionalNote')}
            </label>
            <textarea
              id="note_resolution"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-field bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
              <span aria-hidden="true">⚠️</span>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-2 text-base font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            <span aria-hidden="true" className="text-xl">
              ✓
            </span>
            {submitting ? t('common.sending') : t('maintenance.detail.resoudre')}
          </button>
        </div>
      )}
    </div>
  )
}
