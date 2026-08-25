import { useEffect, useState } from 'react'
import {
  assignerTicketMaintenance,
  fetchTicketsMaintenance,
  fetchTicketsMaintenanceParAppartement,
  fetchUtilisateurs,
  refuserResolutionTicketMaintenance,
  resolveStorageUrl,
  validerResolutionTicketMaintenance,
  type RefuserInput,
} from '../api'
import type { Agent, Appartement, TicketMaintenance, TicketMaintenanceParAppartement, TicketMaintenanceStatut } from '../types'
import { STATUT_VALIDATION_STYLES } from '../utils/statutValidation'
import { URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'
import { RefuserModal } from './RefuserModal'
import { useAudioRecorder, MAX_RECORDING_SECONDS } from '../hooks/useAudioRecorder'
import { RecordingIndicator } from './RecordingIndicator'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

type Vue = 'liste' | 'groupe'

type ExpressionMode = 'texte' | 'audio'

interface AssignerValues {
  agentId: number
  descriptionManager: string
  descriptionManagerAudio: File | null
  photoTransferee: boolean
}

const STATUT_LABELS: Record<TicketMaintenanceStatut, string> = {
  ouvert: 'Ouvert',
  assigne: 'Assigné',
  resolu_en_attente_validation: 'Résolu — en attente de validation',
  a_refaire: 'À refaire',
  resolu: 'Résolu',
}

const STATUT_STYLES: Record<TicketMaintenanceStatut, string> = {
  ouvert: 'bg-warning-bg text-warning-text',
  assigne: 'bg-brand-pale text-brand',
  resolu_en_attente_validation: STATUT_VALIDATION_STYLES.en_attente,
  a_refaire: STATUT_VALIDATION_STYLES.refuse,
  resolu: STATUT_VALIDATION_STYLES.valide,
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AssignerForm({
  ticket,
  agents,
  onAssigner,
}: {
  ticket: TicketMaintenance
  agents: Agent[]
  onAssigner: (ticketId: number, values: AssignerValues) => Promise<void>
}) {
  const [agentId, setAgentId] = useState('')
  const [expressionMode, setExpressionMode] = useState<ExpressionMode>('texte')
  const [descriptionManager, setDescriptionManager] = useState('')
  const [photoTransferee, setPhotoTransferee] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    filename: 'instruction-manager.webm',
    micErrorMessage: "Impossible d'accéder au micro.",
  })

  const hasExpression = descriptionManager.trim() !== '' || audioFile !== null

  const handleAssigner = async () => {
    setError(null)
    if (!agentId) {
      setError('Choisissez un agent de maintenance.')
      return
    }
    if (!hasExpression) {
      setError('Écrivez une description ou enregistrez un message audio pour l\'agent.')
      return
    }

    setSubmitting(true)
    try {
      await onAssigner(ticket.id, {
        agentId: Number(agentId),
        descriptionManager,
        descriptionManagerAudio: audioFile,
        photoTransferee,
      })
    } catch (err) {
      setError(
        friendlyUploadErrorMessage(err, {
          tooLarge: 'Enregistrement audio trop lourd, recommencez un enregistrement plus court.',
          generic: 'Une erreur est survenue.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mt-3">
        <p className="block text-xs font-semibold text-ink-secondary">Message pour l'agent de maintenance</p>
        <div className="mt-1 flex gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={expressionMode === 'texte'}
            onClick={() => setExpressionMode('texte')}
            className={`rounded-field px-3 py-1.5 text-sm font-medium ${
              expressionMode === 'texte' ? 'bg-brand text-white' : 'bg-table-header-bg text-ink-secondary hover:bg-border-light'
            }`}
          >
            Écrire
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={expressionMode === 'audio'}
            onClick={() => setExpressionMode('audio')}
            className={`rounded-field px-3 py-1.5 text-sm font-medium ${
              expressionMode === 'audio' ? 'bg-brand text-white' : 'bg-table-header-bg text-ink-secondary hover:bg-border-light'
            }`}
          >
            Enregistrer un audio
          </button>
        </div>

        {expressionMode === 'texte' ? (
          <textarea
            id={`ticket_description_manager_${ticket.id}`}
            aria-label="Instruction écrite pour l'agent"
            value={descriptionManager}
            onChange={(e) => setDescriptionManager(e.target.value)}
            rows={2}
            className="mt-2 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        ) : (
          <div className="mt-2">
            {!micSupported ? (
              <p className="text-xs text-ink-disabled">Enregistrement audio non disponible.</p>
            ) : recordingState === 'idle' ? (
              <button
                type="button"
                onClick={startRecording}
                className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
              >
                🎤 Démarrer l'enregistrement
              </button>
            ) : recordingState === 'recording' ? (
              <button
                type="button"
                onClick={stopRecording}
                data-testid={`recording-indicator-${ticket.id}`}
                className="rounded-field bg-danger px-3 py-1.5 text-sm font-bold text-white"
              >
                ⏹ Arrêter l'enregistrement
              </button>
            ) : null}
            {recordingState === 'recording' && (
              <RecordingIndicator elapsedSeconds={elapsedSeconds} maxSeconds={MAX_RECORDING_SECONDS} />
            )}
            {recordingState === 'recorded' && (
              <div className="flex items-center gap-2">
                {audioPreviewUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls src={audioPreviewUrl} className="h-8" />
                )}
                <button
                  type="button"
                  onClick={resetAudio}
                  className="rounded-field border border-border-default px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-table-header-bg"
                >
                  Recommencer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {ticket.photo_url && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={photoTransferee}
            onChange={(e) => setPhotoTransferee(e.target.checked)}
          />
          Transférer la photo du signalement à l'agent de maintenance
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`ticket_agent_${ticket.id}`} className="block text-xs font-semibold text-ink-secondary">
            Agent de maintenance
          </label>
          <select
            id={`ticket_agent_${ticket.id}`}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Sélectionner un agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.nom}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAssigner}
          disabled={submitting || !hasExpression}
          className="rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {submitting ? 'Assignation...' : 'Assigner'}
        </button>
      </div>
      {(error || micError) && <p className="mt-1 text-sm text-danger">{error || micError}</p>}
    </>
  )
}

function ExtraPhotos({ photos, alt }: { photos?: { id: number; photo_url: string }[]; alt: string }) {
  if (!photos || photos.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((photo) => (
        <img
          key={photo.id}
          src={resolveStorageUrl(photo.photo_url)}
          alt={alt}
          className="h-24 w-24 rounded object-cover"
        />
      ))}
    </div>
  )
}

function MessagesAgentHistorique({ ticket }: { ticket: TicketMaintenance }) {
  if (!ticket.messages_agent || ticket.messages_agent.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-ink-secondary">Messages de l'agent</p>
      <ul className="mt-1 space-y-2">
        {ticket.messages_agent.map((message) => (
          <li key={message.id} className="space-y-1 rounded-field bg-table-header-bg p-2 text-sm text-ink-secondary">
            <p className="font-mono text-xs text-ink-tertiary">{formatDate(message.created_at)}</p>
            {message.note && <p>{message.note}</p>}
            {message.audio_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={resolveStorageUrl(message.audio_url)} className="w-full" />
            )}
            <div className="flex flex-wrap gap-2">
              {message.photo_url && (
                <img
                  src={resolveStorageUrl(message.photo_url)}
                  alt="Photo du message de l'agent"
                  className="h-24 w-24 rounded object-cover"
                />
              )}
              <ExtraPhotos photos={message.photos_supplementaires} alt="Photo du message de l'agent" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RefusHistorique({ ticket }: { ticket: TicketMaintenance }) {
  if (!ticket.refus || ticket.refus.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-ink-secondary">Historique des refus</p>
      <ul className="mt-1 space-y-2">
        {ticket.refus.map((refus) => (
          <li key={refus.id} className="space-y-1 rounded-field bg-danger-bg p-2 text-sm text-danger">
            <p className="font-mono text-xs text-danger">
              {formatDate(refus.created_at)}
              {refus.manager?.nom && ` · ${refus.manager.nom}`}
            </p>
            {refus.motif && <p>{refus.motif}</p>}
            {refus.motif_audio_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio controls src={resolveStorageUrl(refus.motif_audio_url)} className="w-full" />
            )}
            {refus.motif_photo_url && (
              <img
                src={resolveStorageUrl(refus.motif_photo_url)}
                alt="Photo du motif de refus"
                className="h-24 w-24 rounded object-cover"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ValiderRefuserActions({
  ticket,
  onValider,
  onRefuser,
}: {
  ticket: TicketMaintenance
  onValider: (ticketId: number) => Promise<void>
  onRefuser: (ticketId: number, input: RefuserInput) => Promise<void>
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
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {ticket.photo_apres && (
          <img
            src={resolveStorageUrl(ticket.photo_apres)}
            alt="Photo après réparation"
            className="h-32 w-32 rounded-md object-cover"
          />
        )}
        <ExtraPhotos photos={ticket.photos_resolution} alt="Photo après réparation" />
      </div>
      {ticket.cout_reparation != null && (
        <p className="font-mono text-sm font-bold text-ink">Coût : {ticket.cout_reparation} MAD</p>
      )}
      {ticket.note_resolution && <p className="text-sm text-ink-secondary">{ticket.note_resolution}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleValider}
          disabled={submitting}
          className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? 'Validation...' : 'Valider'}
        </button>
        <button
          type="button"
          onClick={() => setShowRefuserModal(true)}
          disabled={submitting}
          className="rounded-field bg-danger px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {showRefuserModal && (
        <RefuserModal
          title={`Refuser la résolution — ${ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}`}
          onCancel={() => setShowRefuserModal(false)}
          onConfirm={async ({ motif, motifAudio, motifPhoto }) => {
            await onRefuser(ticket.id, { motif, motifAudio, motifPhoto })
            setShowRefuserModal(false)
          }}
        />
      )}
    </div>
  )
}

function TicketMaintenanceCard({
  ticket,
  agents,
  onAssigner,
  onValider,
  onRefuser,
}: {
  ticket: TicketMaintenance
  agents: Agent[]
  onAssigner: (ticketId: number, values: AssignerValues) => Promise<void>
  onValider: (ticketId: number) => Promise<void>
  onRefuser: (ticketId: number, input: RefuserInput) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="rounded-field border border-border-default">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <span className="truncate">{ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}</span>
            <span className="shrink-0 font-mono text-xs font-normal text-ink-tertiary">{ticket.reference}</span>
          </p>
          <p className="truncate text-sm text-ink-secondary">{ticket.description || 'Aucune description.'}</p>
          <p className="font-mono text-xs text-ink-tertiary">{formatDate(ticket.created_at)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${URGENCE_STYLES[ticket.urgence]}`}>
            Urgence {URGENCE_LABELS[ticket.urgence]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_STYLES[ticket.statut]}`}>
            {STATUT_LABELS[ticket.statut]}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border-light p-4 pt-3">
          {ticket.mission_origine?.sejour && (
            <p className="text-xs text-ink-tertiary">
              Signalé pendant le séjour de {ticket.mission_origine.sejour.nom_voyageur} (
              {ticket.mission_origine.sejour.reference})
              {ticket.mission_origine.agent?.nom && ` · par ${ticket.mission_origine.agent.nom}`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {ticket.photo_url && (
              <img
                src={resolveStorageUrl(ticket.photo_url)}
                alt="Photo du problème signalé"
                className="h-32 w-32 rounded-md object-cover"
              />
            )}
            <ExtraPhotos photos={ticket.photos_signalement} alt="Photo du problème signalé" />
          </div>

          {ticket.audio_url && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={resolveStorageUrl(ticket.audio_url)} className="w-full" />
          )}

          <MessagesAgentHistorique ticket={ticket} />

          {ticket.statut === 'ouvert' && <AssignerForm ticket={ticket} agents={agents} onAssigner={onAssigner} />}

          {ticket.statut === 'resolu_en_attente_validation' && (
            <ValiderRefuserActions ticket={ticket} onValider={onValider} onRefuser={onRefuser} />
          )}

          {(ticket.statut === 'assigne' || ticket.statut === 'a_refaire' || ticket.statut === 'resolu') && (
            <div className="space-y-3">
              {ticket.description_manager && (
                <p className="text-sm text-ink-secondary">
                  <span className="font-semibold">Message pour l'agent : </span>
                  {ticket.description_manager}
                </p>
              )}
              {ticket.agent && (
                <p className="text-sm text-ink-secondary">
                  <span className="font-semibold">Agent assigné : </span>
                  {ticket.agent.nom}
                </p>
              )}
              {ticket.statut === 'resolu' && ticket.photo_apres && (
                <div>
                  <p className="text-xs font-semibold text-ink-secondary">Photo après réparation</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <img
                      src={resolveStorageUrl(ticket.photo_apres)}
                      alt="Photo après réparation"
                      className="h-32 w-32 rounded-md object-cover"
                    />
                    <ExtraPhotos photos={ticket.photos_resolution} alt="Photo après réparation" />
                  </div>
                </div>
              )}
              {ticket.statut === 'resolu' && ticket.cout_reparation != null && (
                <p className="font-mono text-sm font-bold text-ink">Coût : {ticket.cout_reparation} MAD</p>
              )}
              <RefusHistorique ticket={ticket} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function AppartementGroupeCard({
  groupe,
  agents,
  onAssigner,
  onValider,
  onRefuser,
}: {
  groupe: TicketMaintenanceParAppartement
  agents: Agent[]
  onAssigner: (ticketId: number, values: AssignerValues) => Promise<void>
  onValider: (ticketId: number) => Promise<void>
  onRefuser: (ticketId: number, input: RefuserInput) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="rounded-field border border-border-default">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <span className="truncate">{groupe.appartement?.nom ?? 'Appartement inconnu'}</span>
            {groupe.recurrent && (
              <span
                data-testid={`recurrent-badge-${groupe.appartement?.id}`}
                className="shrink-0 rounded-badge bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger"
              >
                Récurrent
              </span>
            )}
          </p>
          <p className="truncate text-sm text-ink-tertiary">{groupe.appartement?.adresse}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-badge bg-table-header-bg px-2 py-0.5 text-xs font-medium text-ink-secondary">
            {groupe.tickets_count} ticket{groupe.tickets_count > 1 ? 's' : ''}
          </span>
          <span className="font-mono text-sm font-bold text-ink" data-testid={`cout-cumule-${groupe.appartement?.id}`}>
            {groupe.cout_cumule.toFixed(2)} MAD
          </span>
        </div>
      </button>

      {expanded && (
        <ul className="space-y-2 border-t border-border-light p-4 pt-3">
          {groupe.tickets.map((ticket) => (
            <TicketMaintenanceCard
              key={ticket.id}
              ticket={ticket}
              agents={agents}
              onAssigner={onAssigner}
              onValider={onValider}
              onRefuser={onRefuser}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export interface TicketsMaintenanceSectionProps {
  appartements: Appartement[]
  initialStatutFilter?: TicketMaintenanceStatut | ''
}

/**
 * The single "Tickets de maintenance" screen -- combines what used to be
 * three separate, overlapping Manager views (the actionable list, the
 * résolutions-à-valider queue, and the read-only historique) into one
 * filterable list where each ticket's expanded detail shows exactly the
 * one action relevant to its current statut (assigner / valider-refuser /
 * nothing to do yet).
 */
export function TicketsMaintenanceSection({ appartements, initialStatutFilter }: TicketsMaintenanceSectionProps) {
  const [vue, setVue] = useState<Vue>('liste')
  const [tickets, setTickets] = useState<TicketMaintenance[]>([])
  const [groupes, setGroupes] = useState<TicketMaintenanceParAppartement[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statutFilter, setStatutFilter] = useState<TicketMaintenanceStatut | ''>(initialStatutFilter ?? '')
  const [appartementFilter, setAppartementFilter] = useState('')
  const [urgenceFilter, setUrgenceFilter] = useState<TicketMaintenance['urgence'] | ''>('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    setError(null)
    const filtres = {
      statut: statutFilter || undefined,
      appartementId: appartementFilter ? Number(appartementFilter) : undefined,
      dateDebut: dateDebut || undefined,
      dateFin: dateFin || undefined,
      search: search || undefined,
    }
    Promise.all([
      vue === 'liste' ? fetchTicketsMaintenance(filtres) : fetchTicketsMaintenanceParAppartement(filtres),
      fetchUtilisateurs({ role: 'maintenance' }),
    ])
      .then(([data, agentsData]) => {
        if (vue === 'liste') {
          setTickets(data as TicketMaintenance[])
        } else {
          setGroupes(data as TicketMaintenanceParAppartement[])
        }
        setAgents(agentsData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les tickets.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue, statutFilter, appartementFilter, dateDebut, dateFin, search])

  useEffect(() => {
    if (initialStatutFilter) setStatutFilter(initialStatutFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatutFilter])

  const handleAssigner = async (ticketId: number, values: AssignerValues) => {
    await assignerTicketMaintenance(ticketId, {
      agentId: values.agentId,
      descriptionManager: values.descriptionManager.trim() ? values.descriptionManager : null,
      descriptionManagerAudio: values.descriptionManagerAudio,
      photoTransferee: values.photoTransferee,
    })
    load()
  }

  const handleValider = async (ticketId: number) => {
    await validerResolutionTicketMaintenance(ticketId)
    load()
  }

  const handleRefuser = async (ticketId: number, input: RefuserInput) => {
    await refuserResolutionTicketMaintenance(ticketId, input)
    load()
  }

  const visibleTickets = urgenceFilter ? tickets.filter((ticket) => ticket.urgence === urgenceFilter) : tickets

  // The urgence filter is client-side only (same as the flat list above),
  // so a grouped appartement's ticket_count/cout_cumule are recomputed from
  // its filtered tickets rather than the backend-reported (urgence-blind)
  // totals -- an appartement with no ticket left at that urgence disappears
  // entirely instead of showing an empty, misleadingly non-zero group.
  const visibleGroupes = groupes
    .map((groupe) => {
      const filteredTickets = urgenceFilter
        ? groupe.tickets.filter((ticket) => ticket.urgence === urgenceFilter)
        : groupe.tickets
      return {
        ...groupe,
        tickets: filteredTickets,
        tickets_count: filteredTickets.length,
        cout_cumule: filteredTickets.reduce((total, ticket) => total + (Number(ticket.cout_reparation) || 0), 0),
      }
    })
    .filter((groupe) => groupe.tickets.length > 0)

  const totalVisible = vue === 'liste' ? visibleTickets.length : visibleGroupes.reduce((total, g) => total + g.tickets_count, 0)

  return (
    <div className="rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        Tickets de maintenance
        <span className="rounded-badge bg-warning-bg px-2 py-0.5 text-xs font-bold text-warning-text">
          {totalVisible}
        </span>
      </h2>

      <div className="mt-3 flex gap-1 rounded-field bg-table-header-bg p-1" role="tablist" aria-label="Mode d'affichage de l'historique">
        <button
          type="button"
          role="tab"
          aria-selected={vue === 'liste'}
          onClick={() => setVue('liste')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            vue === 'liste' ? 'bg-surface text-brand shadow-sm' : 'text-ink-tertiary hover:text-ink-secondary'
          }`}
        >
          Vue chronologique
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vue === 'groupe'}
          onClick={() => setVue('groupe')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            vue === 'groupe' ? 'bg-surface text-brand shadow-sm' : 'text-ink-tertiary hover:text-ink-secondary'
          }`}
        >
          Groupé par appartement
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-card-manager border border-border-default bg-table-header-bg p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label htmlFor="tickets_statut" className="block text-xs font-semibold text-ink-secondary">
            Statut
          </label>
          <select
            id="tickets_statut"
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as TicketMaintenanceStatut | '')}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Tous</option>
            <option value="ouvert">Ouvert</option>
            <option value="assigne">Assigné</option>
            <option value="resolu_en_attente_validation">Résolu — en attente de validation</option>
            <option value="a_refaire">À refaire</option>
            <option value="resolu">Résolu</option>
          </select>
        </div>
        <div>
          <label htmlFor="tickets_urgence" className="block text-xs font-semibold text-ink-secondary">
            Urgence
          </label>
          <select
            id="tickets_urgence"
            value={urgenceFilter}
            onChange={(e) => setUrgenceFilter(e.target.value as TicketMaintenance['urgence'] | '')}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Toutes</option>
            <option value="haute">Haute</option>
            <option value="normale">Normale</option>
            <option value="basse">Basse</option>
          </select>
        </div>
        <div>
          <label htmlFor="tickets_appartement" className="block text-xs font-semibold text-ink-secondary">
            Appartement
          </label>
          <select
            id="tickets_appartement"
            value={appartementFilter}
            onChange={(e) => setAppartementFilter(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          >
            <option value="">Tous</option>
            {appartements.map((appartement) => (
              <option key={appartement.id} value={appartement.id}>
                {appartement.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tickets_date_debut" className="block text-xs font-semibold text-ink-secondary">
            Du
          </label>
          <input
            id="tickets_date_debut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="tickets_date_fin" className="block text-xs font-semibold text-ink-secondary">
            Au
          </label>
          <input
            id="tickets_date_fin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="tickets_recherche" className="block text-xs font-semibold text-ink-secondary">
            Recherche
          </label>
          <input
            id="tickets_recherche"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Référence, appartement..."
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
      </div>

      {loading && <p className="mt-2 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {!loading && !error && vue === 'liste' && visibleTickets.length === 0 && (
        <p className="mt-2 text-sm text-ink-tertiary">Aucun ticket de maintenance.</p>
      )}

      {!loading && !error && vue === 'liste' && visibleTickets.length > 0 && (
        <ul className="mt-3 space-y-3">
          {visibleTickets.map((ticket) => (
            <TicketMaintenanceCard
              key={ticket.id}
              ticket={ticket}
              agents={agents}
              onAssigner={handleAssigner}
              onValider={handleValider}
              onRefuser={handleRefuser}
            />
          ))}
        </ul>
      )}

      {!loading && !error && vue === 'groupe' && visibleGroupes.length === 0 && (
        <p className="mt-2 text-sm text-ink-tertiary">Aucun ticket de maintenance.</p>
      )}

      {!loading && !error && vue === 'groupe' && visibleGroupes.length > 0 && (
        <ul className="mt-3 space-y-3">
          {visibleGroupes.map((groupe) => (
            <AppartementGroupeCard
              key={groupe.appartement?.id ?? 'inconnu'}
              groupe={groupe}
              agents={agents}
              onAssigner={handleAssigner}
              onValider={handleValider}
              onRefuser={handleRefuser}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
