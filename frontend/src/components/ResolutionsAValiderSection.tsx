import { useEffect, useState } from 'react'
import {
  fetchTicketsMaintenance,
  refuserResolutionTicketMaintenance,
  resolveStorageUrl,
  validerResolutionTicketMaintenance,
} from '../api'
import type { TicketMaintenance } from '../types'

function RefuserModal({
  ticket,
  onCancel,
  onConfirm,
}: {
  ticket: TicketMaintenance
  onCancel: () => void
  onConfirm: (motif: string) => Promise<void>
}) {
  const [motif, setMotif] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await onConfirm(motif.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h3 className="text-base font-semibold text-gray-900">
          Refuser la résolution — {ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}
        </h3>
        <div className="mt-3">
          <label htmlFor={`motif_refus_${ticket.id}`} className="block text-sm font-medium text-gray-700">
            Motif du refus
          </label>
          <textarea
            id={`motif_refus_${ticket.id}`}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="Expliquez pourquoi cette résolution n'est pas acceptée..."
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || motif.trim() === ''}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Envoi...' : 'Confirmer le refus'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResolutionCard({
  ticket,
  onValider,
  onRefuser,
}: {
  ticket: TicketMaintenance
  onValider: (ticketId: number) => Promise<void>
  onRefuser: (ticketId: number, motif: string) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRefuserModal, setShowRefuserModal] = useState(false)

  const handleValider = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await onValider(ticket.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="rounded-md border border-gray-200 p-4">
      <div>
        <p className="font-medium text-gray-900">
          {ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}
          <span className="ml-2 text-xs font-normal text-gray-400">{ticket.reference}</span>
        </p>
        <p className="text-sm text-gray-500">{ticket.appartement?.adresse}</p>
      </div>

      {ticket.description_manager && <p className="mt-2 text-sm text-gray-700">{ticket.description_manager}</p>}

      {ticket.photo_apres && (
        <img
          src={resolveStorageUrl(ticket.photo_apres)}
          alt="Photo après réparation"
          className="mt-2 h-32 w-32 rounded-md object-cover"
        />
      )}

      {ticket.audio_resolution_url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={resolveStorageUrl(ticket.audio_resolution_url)} className="mt-2 w-full" />
      )}

      {ticket.cout_reparation != null && (
        <p className="mt-2 text-sm font-medium text-gray-900">Coût : {ticket.cout_reparation} MAD</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleValider}
          disabled={submitting}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? 'Validation...' : 'Valider'}
        </button>
        <button
          type="button"
          onClick={() => setShowRefuserModal(true)}
          disabled={submitting}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {showRefuserModal && (
        <RefuserModal
          ticket={ticket}
          onCancel={() => setShowRefuserModal(false)}
          onConfirm={async (motif) => {
            await onRefuser(ticket.id, motif)
            setShowRefuserModal(false)
          }}
        />
      )}
    </li>
  )
}

export function ResolutionsAValiderSection() {
  const [tickets, setTickets] = useState<TicketMaintenance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetchTicketsMaintenance('resolu_en_attente_validation')
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les résolutions.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleValider = async (ticketId: number) => {
    await validerResolutionTicketMaintenance(ticketId)
    setTickets((current) => current.filter((t) => t.id !== ticketId))
  }

  const handleRefuser = async (ticketId: number, motif: string) => {
    await refuserResolutionTicketMaintenance(ticketId, motif)
    setTickets((current) => current.filter((t) => t.id !== ticketId))
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        Résolutions à valider
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {tickets.length}
        </span>
      </h2>

      {loading && <p className="mt-2 text-sm text-gray-500">Chargement...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && !error && tickets.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Aucune résolution en attente de validation.</p>
      )}

      {!loading && !error && tickets.length > 0 && (
        <ul className="mt-3 space-y-3">
          {tickets.map((ticket) => (
            <ResolutionCard key={ticket.id} ticket={ticket} onValider={handleValider} onRefuser={handleRefuser} />
          ))}
        </ul>
      )}
    </div>
  )
}
