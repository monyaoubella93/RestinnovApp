import { useState } from 'react'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => Promise<void>
}

/**
 * Generic Manager-facing confirmation modal for a single yes/no decision
 * (e.g. cancelling a séjour) -- lighter than RefuserModal, which also
 * collects a text/audio/photo motif.
 */
export function ConfirmModal({ title, message, confirmLabel = 'Confirmer', onCancel, onConfirm }: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-card-manager bg-surface p-5 shadow-lg">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-ink-secondary">{message}</p>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

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
            disabled={submitting}
            className="rounded-field bg-danger px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? 'Confirmation...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
