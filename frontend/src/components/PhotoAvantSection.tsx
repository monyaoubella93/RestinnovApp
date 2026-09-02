import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

interface PhotoAvantSectionProps {
  missionMenageId: number
  onCommencer: (missionMenageId: number, photo: File) => Promise<void>
}

/**
 * Gate shown instead of the checklist while a mission is still "a_faire":
 * the agent must document the apartment's state before starting, and this
 * is the only way to move the mission to "en_cours" (see
 * MissionMenageController::commencer()).
 */
export function PhotoAvantSection({ missionMenageId, onCommencer }: PhotoAvantSectionProps) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setSubmitting(true)
    try {
      await onCommencer(missionMenageId, file)
    } catch (err) {
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: t('menage.photoAvant.photoTooLarge'),
          generic: t('common.genericError'),
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-card-agent-lg border-2 border-brand-border bg-brand-pale p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand">
        <span aria-hidden="true" className="text-lg">
          💡
        </span>
        {t('menage.photoAvant.hint')}
      </p>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('menage.photoAvant.openCamera')}
          disabled={submitting}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-brand-border bg-surface text-4xl hover:brightness-95 disabled:opacity-50"
        >
          📷
        </button>
        <span className="text-xs font-medium text-ink-tertiary">{t('menage.photoAvant.caption')}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          aria-label={t('menage.photoAvant.inputLabel')}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleFile(file)
          }}
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
        onClick={() => fileInputRef.current?.click()}
        disabled={submitting}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-4 text-lg font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true" className="text-xl">
          📸
        </span>
        {submitting ? t('menage.photoAvant.sending') : t('menage.photoAvant.button')}
      </button>
    </div>
  )
}
