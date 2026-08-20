import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { marquerTicketMaintenanceRefusVu, resoudreTicketMaintenance, resolveStorageUrl } from '../api'
import type { MonTicketMaintenance } from '../types'
import { URGENCE_STYLES } from '../utils/urgence'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

interface TicketDetailAgentProps {
  ticket: MonTicketMaintenance
  onBack: () => void
  onResolu: () => void
}

export function TicketDetailAgent({ ticket, onBack, onResolu }: TicketDetailAgentProps) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [coutReparation, setCoutReparation] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolu, setResolu] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ticket.statut === 'a_refaire' && ticket.refus.some((r) => !r.vu)) {
      void marquerTicketMaintenanceRefusVu(ticket.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  const handlePhotoChange = (file: File | undefined | null) => {
    if (!file) return
    setPhoto(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    setError(null)

    if (!photo) {
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
        photoApres: photo,
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
            className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${URGENCE_STYLES[ticket.urgence]}`}
          >
            {t('maintenance.urgenceLabel', { label: t(`common.urgence.${ticket.urgence}`) })}
          </span>
        </div>

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
              accept="image/jpeg,image/png"
              capture="environment"
              className="hidden"
              aria-label={t('maintenance.detail.photoReparation')}
              onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            />
            {photoPreviewUrl && (
              <img
                src={photoPreviewUrl}
                alt={t('maintenance.detail.previewAlt')}
                className="mt-1 h-20 w-20 rounded-lg object-cover"
              />
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
