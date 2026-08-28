import { useEffect, useMemo, useRef, useState } from 'react'
import { assignerTicketMaintenance, fetchTicketsMaintenance, fetchUtilisateurs, resolveStorageUrl } from '../api'
import type { Agent, TicketMaintenance } from '../types'
import { EN_RETARD_STYLE, formatDateLimite, URGENCE_LABELS, URGENCE_STYLES } from '../utils/urgence'

type ExpressionMode = 'texte' | 'audio'

type RecordingState = 'idle' | 'recording' | 'recorded'

interface AssignerValues {
  agentId: number
  descriptionManager: string
  descriptionManagerAudio: File | null
  photoTransferee: boolean
  dateLimiteIntervention: string
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
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [photoTransferee, setPhotoTransferee] = useState(false)
  const [dateLimiteIntervention, setDateLimiteIntervention] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const micSupported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const hasExpression = descriptionManager.trim() !== '' || audioFile !== null

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
        const file = new File([blob], 'instruction-manager.webm', { type: blob.type })
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
        dateLimiteIntervention,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mt-3">
        <p className="block text-xs font-medium text-gray-600">Message pour l'agent de maintenance</p>
        <div className="mt-1 flex gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={expressionMode === 'texte'}
            onClick={() => setExpressionMode('texte')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              expressionMode === 'texte' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Écrire
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={expressionMode === 'audio'}
            onClick={() => setExpressionMode('audio')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              expressionMode === 'audio' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        ) : (
          <div className="mt-2">
            {!micSupported ? (
              <p className="text-xs text-gray-400">Enregistrement audio non disponible.</p>
            ) : recordingState === 'idle' ? (
              <button
                type="button"
                onClick={startRecording}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                🎤 Démarrer l'enregistrement
              </button>
            ) : recordingState === 'recording' ? (
              <button
                type="button"
                onClick={stopRecording}
                data-testid={`recording-indicator-${ticket.id}`}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                ⏹ Arrêter l'enregistrement
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {audioPreviewUrl && (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <audio controls src={audioPreviewUrl} className="h-8" />
                )}
                <button
                  type="button"
                  onClick={resetAudio}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Recommencer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {ticket.photo_url && (
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
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
          <label htmlFor={`ticket_agent_${ticket.id}`} className="block text-xs font-medium text-gray-600">
            Agent de maintenance
          </label>
          <select
            id={`ticket_agent_${ticket.id}`}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sélectionner un agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={`ticket_date_limite_${ticket.id}`} className="block text-xs font-medium text-gray-600">
            Date limite d'intervention
          </label>
          <input
            id={`ticket_date_limite_${ticket.id}`}
            type="date"
            value={dateLimiteIntervention}
            onChange={(e) => setDateLimiteIntervention(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleAssigner}
          disabled={submitting || !hasExpression}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Assignation...' : 'Assigner'}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </>
  )
}

function TicketMaintenanceCard({
  ticket,
  agents,
  onAssigner,
}: {
  ticket: TicketMaintenance
  agents: Agent[]
  onAssigner: (ticketId: number, values: AssignerValues) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const isARefaire = ticket.statut === 'a_refaire'

  return (
    <li className="rounded-md border border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-gray-900">
            <span className="truncate">{ticket.appartement?.nom ?? `Appartement #${ticket.appartement_id}`}</span>
            <span className="shrink-0 text-xs font-normal text-gray-400">{ticket.reference}</span>
          </p>
          <p className="truncate text-sm text-gray-700">{ticket.description || 'Aucune description.'}</p>
          <p className="text-xs text-gray-400">
            {formatDate(ticket.created_at)}
            {ticket.mission_origine?.agent?.nom && ` · Signalé par ${ticket.mission_origine.agent.nom}`}
          </p>
          {ticket.date_limite_intervention && !ticket.est_en_retard && (
            <p className="text-xs text-gray-400">
              À effectuer avant {formatDateLimite(ticket.date_limite_intervention)}
            </p>
          )}
          {isARefaire && (
            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              Renvoyé par le Manager — à refaire
            </span>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            ticket.est_en_retard ? EN_RETARD_STYLE : URGENCE_STYLES[ticket.urgence]
          }`}
        >
          {ticket.est_en_retard ? 'En retard' : `Urgence ${URGENCE_LABELS[ticket.urgence]}`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 pt-3">
          {ticket.mission_origine?.sejour && (
            <p className="text-xs text-gray-400">
              Signalé pendant le séjour de {ticket.mission_origine.sejour.nom_voyageur} (
              {ticket.mission_origine.sejour.reference})
            </p>
          )}

          {ticket.photo_url && (
            <img
              src={resolveStorageUrl(ticket.photo_url)}
              alt="Photo du problème signalé"
              className="mt-2 h-32 w-32 rounded-md object-cover"
            />
          )}

          {ticket.audio_url && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <audio controls src={resolveStorageUrl(ticket.audio_url)} className="mt-2 w-full" />
          )}

          {isARefaire ? (
            <div className="mt-3 space-y-3">
              {ticket.description_manager && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Message pour l'agent : </span>
                  {ticket.description_manager}
                </p>
              )}
              {ticket.agent && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Agent assigné : </span>
                  {ticket.agent.nom}
                </p>
              )}
              {ticket.date_limite_intervention && (
                <p className={`text-sm ${ticket.est_en_retard ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                  <span className="font-medium">
                    {ticket.est_en_retard ? 'En retard depuis le ' : "À effectuer avant "}
                  </span>
                  {formatDateLimite(ticket.date_limite_intervention)}
                </p>
              )}
              {ticket.refus && ticket.refus.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600">Historique des refus</p>
                  <ul className="mt-1 space-y-2">
                    {ticket.refus.map((refus) => (
                      <li key={refus.id} className="rounded-md bg-red-50 p-2 text-sm text-red-700">
                        <p className="text-xs text-red-500">
                          {formatDate(refus.created_at)}
                          {refus.manager?.nom && ` · ${refus.manager.nom}`}
                        </p>
                        {refus.motif}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <AssignerForm ticket={ticket} agents={agents} onAssigner={onAssigner} />
          )}
        </div>
      )}
    </li>
  )
}

type UrgenceFilter = TicketMaintenance['urgence'] | ''
type DateSort = 'recent' | 'ancien'

export function TicketsMaintenanceSection() {
  const [tickets, setTickets] = useState<TicketMaintenance[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [urgenceFilter, setUrgenceFilter] = useState<UrgenceFilter>('')
  const [appartementFilter, setAppartementFilter] = useState('')
  const [dateSort, setDateSort] = useState<DateSort>('recent')

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([fetchTicketsMaintenance(), fetchUtilisateurs({ role: 'maintenance' })])
      .then(([ticketsData, agentsData]) => {
        setTickets(ticketsData.filter((t) => t.statut === 'ouvert' || t.statut === 'a_refaire'))
        setAgents(agentsData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les tickets.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleAssigner = async (ticketId: number, values: AssignerValues) => {
    await assignerTicketMaintenance(ticketId, {
      agentId: values.agentId,
      descriptionManager: values.descriptionManager.trim() ? values.descriptionManager : null,
      descriptionManagerAudio: values.descriptionManagerAudio,
      photoTransferee: values.photoTransferee,
      dateLimiteIntervention: values.dateLimiteIntervention || null,
    })
    // Assigning removes it from the list this screen shows -- the
    // maintenance agent's own workspace is where it lives on from here.
    setTickets((current) => current.filter((t) => t.id !== ticketId))
  }

  const appartementOptions = useMemo(() => {
    const seen = new Map<number, string>()
    tickets.forEach((ticket) => {
      if (ticket.appartement) seen.set(ticket.appartement.id, ticket.appartement.nom)
    })
    return Array.from(seen.entries()).map(([id, nom]) => ({ id, nom }))
  }, [tickets])

  const visibleTickets = useMemo(() => {
    return tickets
      .filter((ticket) => !urgenceFilter || ticket.urgence === urgenceFilter)
      .filter((ticket) => !appartementFilter || String(ticket.appartement_id) === appartementFilter)
      .slice()
      .sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return dateSort === 'recent' ? diff : -diff
      })
  }, [tickets, urgenceFilter, appartementFilter, dateSort])

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        Tickets de maintenance
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {tickets.length}
        </span>
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="tickets_urgence" className="block text-xs font-medium text-gray-500">
            Urgence
          </label>
          <select
            id="tickets_urgence"
            value={urgenceFilter}
            onChange={(e) => setUrgenceFilter(e.target.value as UrgenceFilter)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Toutes</option>
            <option value="haute">Haute</option>
            <option value="normale">Normale</option>
            <option value="basse">Basse</option>
          </select>
        </div>
        <div>
          <label htmlFor="tickets_appartement" className="block text-xs font-medium text-gray-500">
            Appartement
          </label>
          <select
            id="tickets_appartement"
            value={appartementFilter}
            onChange={(e) => setAppartementFilter(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Tous</option>
            {appartementOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tickets_tri_date" className="block text-xs font-medium text-gray-500">
            Date
          </label>
          <select
            id="tickets_tri_date"
            value={dateSort}
            onChange={(e) => setDateSort(e.target.value as DateSort)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="recent">Plus récent d'abord</option>
            <option value="ancien">Plus ancien d'abord</option>
          </select>
        </div>
      </div>

      {loading && <p className="mt-2 text-sm text-gray-500">Chargement...</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {!loading && !error && visibleTickets.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">Aucun ticket de maintenance.</p>
      )}

      {!loading && !error && visibleTickets.length > 0 && (
        <ul className="mt-3 space-y-3">
          {visibleTickets.map((ticket) => (
            <TicketMaintenanceCard key={ticket.id} ticket={ticket} agents={agents} onAssigner={handleAssigner} />
          ))}
        </ul>
      )}
    </div>
  )
}
