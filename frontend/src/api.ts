import type {
  Agent,
  Appartement,
  CalendrierData,
  ChecklistItem,
  ChecklistModele,
  ChecklistModeleItem,
  DashboardData,
  FraisMaintenance,
  HistoriqueMission,
  HistoriqueMissionAgent,
  HistoriqueMissionManager,
  HistoriqueTicketAgent,
  MissionMenage,
  MissionMenagePhotoPreuve,
  ModeGestion,
  MonTicketMaintenance,
  NotificationsData,
  PaginatedResponse,
  PlateformeOrigine,
  ProduitCatalogue,
  ProduitMenageSignale,
  Proprietaire,
  Releve,
  Sejour,
  SejourStatut,
  TicketMaintenance,
  TicketMaintenanceParAppartement,
  TicketMaintenanceStatut,
  Voyageur,
} from './types'
import { enqueueAction, type QueuedFileField } from './pwa/offlineQueue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const TOKEN_STORAGE_KEY = 'auth_token'

export function resolveStorageUrl(path: string): string {
  return `${API_BASE_URL}/storage/${path}`
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

/**
 * Every request's headers, always Accept: application/json plus the bearer
 * token when logged in. `extra` merges in per-request headers (e.g.
 * Content-Type for a JSON body) without every call site repeating this.
 */
function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getStoredToken()

  return {
    Accept: 'application/json',
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/** Exposes the current auth headers to pwa/useOfflineSync.ts, which replays queued requests directly (outside api.ts's own fetch wrappers). */
export function authHeadersForOfflineSync(): HeadersInit {
  return authHeaders()
}

/**
 * A 401 means the stored token is gone/invalid/expired -- drop it and tell
 * the app to fall back to the login screen. AuthProvider listens for this
 * event; api.ts stays decoupled from React/router state.
 */
function handleUnauthorized(response: Response): void {
  if (response.status === 401) {
    setStoredToken(null)
    window.dispatchEvent(new Event('auth:unauthorized'))
  }
}

export type Role = 'manager' | 'menage' | 'maintenance'

export interface LoginInput {
  telephone: string
  password: string
}

export interface LoginResponse {
  token: string
  id: number
  nom: string
  role: Role
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

/**
 * Always drops the local token, even if the server call fails (e.g. the
 * token was already invalid) -- from the user's point of view they are
 * logged out locally either way.
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/logout`, {
      method: 'POST',
      headers: authHeaders(),
    })
  } finally {
    setStoredToken(null)
  }
}

export interface NewSejourInput {
  appartement_id: number
  date_arrivee: string
  date_depart: string
  plateforme_origine: PlateformeOrigine
  montant_mad: number
  voyageurs: Voyageur[]
}

export interface NewAppartementInput {
  nom: string
  adresse: string
  photo: File | null
  checklist_modele_ids: number[]
  agent_habituel_id: number | null
  proprietaire_id?: number | null
  mode_gestion?: ModeGestion
  taux_commission?: number | null
  loyer_fixe_mensuel?: number | null
}

export interface NewProprietaireInput {
  nom: string
  telephone?: string | null
  email?: string | null
}

export interface NewUtilisateurInput {
  nom: string
  role: 'menage' | 'maintenance'
  telephone: string | null
  adresse?: string | null
  password?: string | null
  appartement_ids?: number[]
}

export interface UpdateUtilisateurInput {
  nom: string
  telephone: string | null
  adresse?: string | null
  password?: string | null
}

export interface NewProduitCatalogueInput {
  nom: string
  prix: number
  photo?: File | null
}

export interface UpdateMissionMenageProduitsInput {
  frais_forfait: number
  produit_ids: number[]
}

export interface SignalerProduitInput {
  photo: File
  note?: string | null
}

export interface AjouterPhotosPreuveInput {
  photos: File[]
  note?: string | null
}

export interface SignalerProblemeInput {
  photo?: File | null
  audio?: File | null
  description?: string | null
}

export interface AssignerTicketMaintenanceInput {
  agentId: number
  descriptionManager?: string | null
  descriptionManagerAudio?: File | null
  photoTransferee?: boolean
}

export interface ResoudreTicketMaintenanceInput {
  photoApres: File
  coutReparation: number
  note?: string | null
}

export interface ValiderProduitSignaleInput {
  nom: string
  prix: number
}

export interface NewFraisMaintenanceInput {
  description: string
  prix: number
}

export class ApiError extends Error {
  readonly status: number
  readonly errors?: Record<string, string[]>

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

/**
 * Thrown instead of a network error by the field-work mutations below
 * (checklist toggle, photos, produits, ticket resolution) when the request
 * couldn't reach the server -- it has been written to the offline queue
 * (see pwa/offlineQueue.ts) and will replay automatically once the
 * connection returns. Callers on the agent workspaces catch this
 * specifically to apply the same change to local state optimistically,
 * rather than showing it as a failure.
 */
export class OfflineQueuedError extends Error {
  constructor() {
    super("Hors ligne : l'action a été mise en file d'attente.")
    this.name = 'OfflineQueuedError'
  }
}

export function isOfflineQueuedError(err: unknown): err is OfflineQueuedError {
  return err instanceof OfflineQueuedError
}

function isNetworkFailure(err: unknown): boolean {
  return !navigator.onLine || err instanceof TypeError
}

/**
 * Sends a FormData-bodied mutation; on a genuine network failure (not a
 * server-side rejection -- those still throw ApiError as usual) the request
 * is written to the offline queue for replay and OfflineQueuedError is
 * thrown instead of letting the network error propagate.
 */
async function postFormDataOrQueue(url: string, formData: FormData) {
  try {
    const response = await fetch(url, { method: 'POST', headers: authHeaders(), body: formData })
    return await parseJsonOrThrow(response)
  } catch (err) {
    if (err instanceof ApiError || !isNetworkFailure(err)) throw err

    const fields: Record<string, string> = {}
    const files: QueuedFileField[] = []
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push({ field: key, blob: value, filename: value.name, type: value.type })
      } else {
        fields[key] = value
      }
    }
    await enqueueAction({ url, method: 'POST', fields, files })
    throw new OfflineQueuedError()
  }
}

/** Same offline-queueing behaviour as `postFormDataOrQueue`, for a JSON-bodied PATCH. */
async function patchJsonOrQueue(url: string, json: unknown) {
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(json),
    })
    return await parseJsonOrThrow(response)
  } catch (err) {
    if (err instanceof ApiError || !isNetworkFailure(err)) throw err

    await enqueueAction({ url, method: 'PATCH', json })
    throw new OfflineQueuedError()
  }
}

async function parseJsonOrThrow(response: Response) {
  const data = await response.json().catch(() => null)

  handleUnauthorized(response)

  if (!response.ok) {
    // A 413 can come from nginx (client_max_body_size) or PHP itself
    // (post_max_size) before the request ever reaches Laravel -- in both
    // cases the body isn't JSON, so `data` is null and there is no
    // `data.message` to fall back on. Give a message that still names the
    // actual problem instead of the generic fallback.
    const fallback = response.status === 413 ? 'Le fichier envoyé est trop volumineux.' : 'Une erreur est survenue.'
    throw new ApiError(data?.message ?? fallback, response.status, data?.errors)
  }

  return data
}

export async function fetchAppartements(): Promise<Appartement[]> {
  const response = await fetch(`${API_BASE_URL}/api/appartements`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface FetchAppartementsListeParams {
  search?: string
  statut?: string
  sort_by?: 'nom'
  sort_dir?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export async function fetchAppartementsListe(
  params: FetchAppartementsListeParams = {},
): Promise<PaginatedResponse<Appartement>> {
  const url = new URL(`${API_BASE_URL}/api/appartements`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  if (!url.searchParams.has('page')) url.searchParams.set('page', '1')

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

function appendProprietaireFields(formData: FormData, input: NewAppartementInput): void {
  if (input.proprietaire_id) formData.append('proprietaire_id', String(input.proprietaire_id))
  if (input.mode_gestion) formData.append('mode_gestion', input.mode_gestion)
  if (input.taux_commission != null) formData.append('taux_commission', String(input.taux_commission))
  if (input.loyer_fixe_mensuel != null) formData.append('loyer_fixe_mensuel', String(input.loyer_fixe_mensuel))
}

export async function updateAppartement(id: number, input: NewAppartementInput): Promise<Appartement> {
  const formData = new FormData()
  formData.append('nom', input.nom)
  formData.append('adresse', input.adresse)
  if (input.photo) formData.append('photo', input.photo)
  input.checklist_modele_ids.forEach((id) => formData.append('checklist_modele_ids[]', String(id)))
  if (input.agent_habituel_id) formData.append('agent_habituel_id', String(input.agent_habituel_id))
  appendProprietaireFields(formData, input)
  formData.append('_method', 'PATCH')

  const response = await fetch(`${API_BASE_URL}/api/appartements/${id}`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function createAppartement(input: NewAppartementInput): Promise<Appartement> {
  const formData = new FormData()
  formData.append('nom', input.nom)
  formData.append('adresse', input.adresse)
  if (input.photo) formData.append('photo', input.photo)
  input.checklist_modele_ids.forEach((id) => formData.append('checklist_modele_ids[]', String(id)))
  if (input.agent_habituel_id) formData.append('agent_habituel_id', String(input.agent_habituel_id))
  appendProprietaireFields(formData, input)

  const response = await fetch(`${API_BASE_URL}/api/appartements`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function fetchProprietaires(): Promise<Proprietaire[]> {
  const response = await fetch(`${API_BASE_URL}/api/proprietaires`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function createProprietaire(input: NewProprietaireInput): Promise<Proprietaire> {
  const response = await fetch(`${API_BASE_URL}/api/proprietaires`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function fetchChecklistModeles(): Promise<ChecklistModele[]> {
  const response = await fetch(`${API_BASE_URL}/api/checklist-modeles`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function createChecklistModele(nom: string): Promise<ChecklistModele> {
  const response = await fetch(`${API_BASE_URL}/api/checklist-modeles`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ nom }),
  })

  return parseJsonOrThrow(response)
}

export async function createChecklistModeleItem(
  checklistModeleId: number,
  libelle: string,
  photo?: File | null,
): Promise<ChecklistModeleItem> {
  const formData = new FormData()
  formData.append('libelle', libelle)
  if (photo) formData.append('photo', photo)

  const response = await fetch(`${API_BASE_URL}/api/checklist-modeles/${checklistModeleId}/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function deplacerChecklistModeleItem(
  itemId: number,
  direction: 'haut' | 'bas',
): Promise<ChecklistModeleItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/checklist-modele-items/${itemId}/deplacer`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ direction }),
  })

  return parseJsonOrThrow(response)
}

export async function deleteChecklistModeleItem(itemId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/checklist-modele-items/${itemId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })

  handleUnauthorized(response)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.message ?? 'Une erreur est survenue.', response.status, data?.errors)
  }
}

export interface FetchUtilisateursParams {
  role?: string
  search?: string
  inclure_inactifs?: boolean
}

export async function fetchUtilisateurs(params: FetchUtilisateursParams = {}): Promise<Agent[]> {
  const url = new URL(`${API_BASE_URL}/api/utilisateurs`)
  if (params.role) url.searchParams.set('role', params.role)
  if (params.search) url.searchParams.set('search', params.search)
  if (params.inclure_inactifs) url.searchParams.set('inclure_inactifs', '1')

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function createUtilisateur(input: NewUtilisateurInput): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/api/utilisateurs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function updateUtilisateur(id: number, input: UpdateUtilisateurInput): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/api/utilisateurs/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function desactiverUtilisateur(id: number): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/api/utilisateurs/${id}/desactiver`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function reactiverUtilisateur(id: number): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/api/utilisateurs/${id}/reactiver`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function deleteUtilisateur(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/utilisateurs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })

  handleUnauthorized(response)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.message ?? 'Une erreur est survenue.', response.status, data?.errors)
  }
}

export interface FetchSejoursParams {
  search?: string
  statut?: SejourStatut
  appartement_id?: number
  date_debut?: string
  date_fin?: string
  sort_by?: 'date_arrivee' | 'date_depart'
  sort_dir?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export async function fetchSejours(params: FetchSejoursParams = {}): Promise<PaginatedResponse<Sejour>> {
  const url = new URL(`${API_BASE_URL}/api/sejours`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchSejour(id: number): Promise<Sejour> {
  const response = await fetch(`${API_BASE_URL}/api/sejours/${id}`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function createSejour(input: NewSejourInput): Promise<Sejour> {
  const response = await fetch(`${API_BASE_URL}/api/sejours`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function updateSejour(id: number, input: NewSejourInput): Promise<Sejour> {
  const response = await fetch(`${API_BASE_URL}/api/sejours/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function checkoutSejour(id: number): Promise<{
  sejour: Sejour
  mission_menage: Sejour['mission_menage']
}> {
  const response = await fetch(`${API_BASE_URL}/api/sejours/${id}/checkout`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchProduitsCatalogue(): Promise<ProduitCatalogue[]> {
  const response = await fetch(`${API_BASE_URL}/api/produits-catalogue`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function createProduitCatalogue(input: NewProduitCatalogueInput): Promise<ProduitCatalogue> {
  const formData = new FormData()
  formData.append('nom', input.nom)
  formData.append('prix', String(input.prix))
  if (input.photo) formData.append('photo', input.photo)

  const response = await fetch(`${API_BASE_URL}/api/produits-catalogue`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function updateMissionMenageProduits(
  missionMenageId: number,
  input: UpdateMissionMenageProduitsInput,
): Promise<MissionMenage> {
  return patchJsonOrQueue(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/produits`, input)
}

export async function marquerMissionMenageVue(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/vue`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchMissionsAgent(agentId: number): Promise<MissionMenage[]> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages?agent_id=${agentId}`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchMissionMenage(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchHistoriqueAgent(): Promise<HistoriqueMissionAgent[]> {
  const response = await fetch(`${API_BASE_URL}/api/mes-missions/historique`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function ouvrirMissionMenage(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/ouvrir`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function terminerMissionMenage(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/terminer`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function validerMissionMenage(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/valider`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface RefuserInput {
  motif?: string | null
  motifAudio?: File | null
  motifPhoto?: File | null
}

export async function refuserMissionMenage(missionMenageId: number, input: RefuserInput): Promise<MissionMenage> {
  const formData = new FormData()
  if (input.motif) formData.append('motif', input.motif)
  if (input.motifAudio) formData.append('motif_audio', input.motifAudio)
  if (input.motifPhoto) formData.append('motif_photo', input.motifPhoto)
  formData.append('_method', 'PATCH')

  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/refuser`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function marquerMissionMenageRefusVu(missionMenageId: number): Promise<MissionMenage> {
  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/refus-vu`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface ToggleChecklistItemInput {
  coche?: boolean
  photo?: File
}

export async function toggleChecklistItem(
  checklistItemId: number,
  input: ToggleChecklistItemInput,
): Promise<ChecklistItem> {
  const formData = new FormData()
  formData.append('_method', 'PATCH')
  if (input.coche !== undefined) formData.append('coche', String(input.coche))
  if (input.photo) formData.append('photo', input.photo)

  return postFormDataOrQueue(`${API_BASE_URL}/api/checklist-items/${checklistItemId}`, formData)
}

export async function signalerProduit(
  missionMenageId: number,
  input: SignalerProduitInput,
): Promise<ProduitMenageSignale> {
  const formData = new FormData()
  formData.append('photo', input.photo)
  if (input.note) formData.append('note', input.note)

  return postFormDataOrQueue(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/produits-signales`, formData)
}

export async function ajouterPhotosPreuveMission(
  missionMenageId: number,
  input: AjouterPhotosPreuveInput,
): Promise<MissionMenagePhotoPreuve[]> {
  const formData = new FormData()
  input.photos.forEach((photo) => formData.append('photos[]', photo))
  if (input.note) formData.append('note', input.note)

  return postFormDataOrQueue(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/photos-preuve`, formData)
}

export async function fetchProduitsSignales(statut?: string): Promise<ProduitMenageSignale[]> {
  const url = new URL(`${API_BASE_URL}/api/produits-signales`)
  if (statut) url.searchParams.set('statut', statut)

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function validerProduitSignale(
  id: number,
  input: ValiderProduitSignaleInput,
): Promise<ProduitMenageSignale> {
  const response = await fetch(`${API_BASE_URL}/api/produits-signales/${id}/valider`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function rejeterProduitSignale(id: number): Promise<ProduitMenageSignale> {
  const response = await fetch(`${API_BASE_URL}/api/produits-signales/${id}/rejeter`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function signalerProbleme(
  missionMenageId: number,
  input: SignalerProblemeInput,
): Promise<TicketMaintenance> {
  const formData = new FormData()
  if (input.photo) formData.append('photo', input.photo)
  if (input.audio) formData.append('audio', input.audio)
  if (input.description) formData.append('description', input.description)

  const response = await fetch(`${API_BASE_URL}/api/mission-menages/${missionMenageId}/signalements`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export interface FetchTicketsMaintenanceParams {
  statut?: TicketMaintenanceStatut | ''
  appartementId?: number
  dateDebut?: string
  dateFin?: string
  search?: string
}

export async function fetchTicketsMaintenance(
  params: FetchTicketsMaintenanceParams = {},
): Promise<TicketMaintenance[]> {
  const url = new URL(`${API_BASE_URL}/api/tickets-maintenance`)
  if (params.statut) url.searchParams.set('statut', params.statut)
  if (params.appartementId) url.searchParams.set('appartement_id', String(params.appartementId))
  if (params.dateDebut) url.searchParams.set('date_debut', params.dateDebut)
  if (params.dateFin) url.searchParams.set('date_fin', params.dateFin)
  if (params.search) url.searchParams.set('search', params.search)

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchTicketsMaintenanceParAppartement(
  params: FetchTicketsMaintenanceParams = {},
): Promise<TicketMaintenanceParAppartement[]> {
  const url = new URL(`${API_BASE_URL}/api/tickets-maintenance/par-appartement`)
  if (params.statut) url.searchParams.set('statut', params.statut)
  if (params.appartementId) url.searchParams.set('appartement_id', String(params.appartementId))
  if (params.dateDebut) url.searchParams.set('date_debut', params.dateDebut)
  if (params.dateFin) url.searchParams.set('date_fin', params.dateFin)
  if (params.search) url.searchParams.set('search', params.search)

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function assignerTicketMaintenance(
  id: number,
  input: AssignerTicketMaintenanceInput,
): Promise<TicketMaintenance> {
  const formData = new FormData()
  formData.append('agent_id', String(input.agentId))
  if (input.descriptionManager) formData.append('description_manager', input.descriptionManager)
  if (input.descriptionManagerAudio) formData.append('description_manager_audio', input.descriptionManagerAudio)
  if (input.photoTransferee) formData.append('photo_transferee', '1')
  formData.append('_method', 'PATCH')

  const response = await fetch(`${API_BASE_URL}/api/tickets-maintenance/${id}/assigner`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function fetchMesTicketsMaintenance(): Promise<MonTicketMaintenance[]> {
  const response = await fetch(`${API_BASE_URL}/api/tickets-maintenance/mes-tickets`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface FetchMesTicketsMaintenanceHistoriqueParams {
  appartementId?: number
  dateDebut?: string
  dateFin?: string
  search?: string
}

export async function fetchMesTicketsMaintenanceHistorique(
  params: FetchMesTicketsMaintenanceHistoriqueParams = {},
): Promise<HistoriqueTicketAgent[]> {
  const url = new URL(`${API_BASE_URL}/api/tickets-maintenance/mes-tickets/historique`)
  if (params.appartementId) url.searchParams.set('appartement_id', String(params.appartementId))
  if (params.dateDebut) url.searchParams.set('date_debut', params.dateDebut)
  if (params.dateFin) url.searchParams.set('date_fin', params.dateFin)
  if (params.search) url.searchParams.set('search', params.search)

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function marquerTicketMaintenanceRefusVu(id: number): Promise<TicketMaintenance> {
  const response = await fetch(`${API_BASE_URL}/api/tickets-maintenance/${id}/refus-vu`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface EnvoyerMessageAgentMaintenanceInput {
  photo?: File | null
  audio?: File | null
  note?: string | null
}

export async function envoyerMessageAgentMaintenance(
  id: number,
  input: EnvoyerMessageAgentMaintenanceInput,
): Promise<TicketMaintenance> {
  const formData = new FormData()
  if (input.photo) formData.append('photo', input.photo)
  if (input.audio) formData.append('audio', input.audio)
  if (input.note) formData.append('note', input.note)

  return postFormDataOrQueue(`${API_BASE_URL}/api/tickets-maintenance/${id}/message`, formData)
}

export async function resoudreTicketMaintenance(
  id: number,
  input: ResoudreTicketMaintenanceInput,
): Promise<TicketMaintenance> {
  const formData = new FormData()
  formData.append('photo_apres', input.photoApres)
  formData.append('cout_reparation', String(input.coutReparation))
  if (input.note) formData.append('note', input.note)
  formData.append('_method', 'PATCH')

  return postFormDataOrQueue(`${API_BASE_URL}/api/tickets-maintenance/${id}/resoudre`, formData)
}

export async function validerResolutionTicketMaintenance(id: number): Promise<TicketMaintenance> {
  const response = await fetch(`${API_BASE_URL}/api/tickets-maintenance/${id}/valider-resolution`, {
    method: 'PATCH',
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function refuserResolutionTicketMaintenance(id: number, input: RefuserInput): Promise<TicketMaintenance> {
  const formData = new FormData()
  if (input.motif) formData.append('motif', input.motif)
  if (input.motifAudio) formData.append('motif_audio', input.motifAudio)
  if (input.motifPhoto) formData.append('motif_photo', input.motifPhoto)
  formData.append('_method', 'PATCH')

  const response = await fetch(`${API_BASE_URL}/api/tickets-maintenance/${id}/refuser-resolution`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })

  return parseJsonOrThrow(response)
}

export async function createFraisMaintenance(
  sejourId: number,
  input: NewFraisMaintenanceInput,
): Promise<FraisMaintenance> {
  const response = await fetch(`${API_BASE_URL}/api/sejours/${sejourId}/frais-maintenance`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })

  return parseJsonOrThrow(response)
}

export async function deleteFraisMaintenance(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/frais-maintenance/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })

  handleUnauthorized(response)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.message ?? 'Une erreur est survenue.', response.status, data?.errors)
  }
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchCalendrier(params: { mois: string; appartementId?: number }): Promise<CalendrierData> {
  const url = new URL(`${API_BASE_URL}/api/calendrier`)
  url.searchParams.set('mois', params.mois)
  if (params.appartementId) url.searchParams.set('appartement_id', String(params.appartementId))

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchNotifications(): Promise<NotificationsData> {
  const response = await fetch(`${API_BASE_URL}/api/notifications`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchAppartementHistorique(appartementId: number): Promise<HistoriqueMission[]> {
  const response = await fetch(`${API_BASE_URL}/api/appartements/${appartementId}/historique`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export interface FetchHistoriqueMenageParams {
  appartementId?: number
  dateDebut?: string
  dateFin?: string
}

export async function fetchHistoriqueMenage(
  params: FetchHistoriqueMenageParams = {},
): Promise<HistoriqueMissionManager[]> {
  const url = new URL(`${API_BASE_URL}/api/mission-menages/historique`)
  if (params.appartementId) url.searchParams.set('appartement_id', String(params.appartementId))
  if (params.dateDebut) url.searchParams.set('date_debut', params.dateDebut)
  if (params.dateFin) url.searchParams.set('date_fin', params.dateFin)

  const response = await fetch(url, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

export async function fetchReleve(appartementId: number, mois: string): Promise<Releve> {
  const response = await fetch(`${API_BASE_URL}/api/appartements/${appartementId}/releve?mois=${mois}`, {
    headers: authHeaders(),
  })

  return parseJsonOrThrow(response)
}

/**
 * The PDF endpoint requires the same bearer-token auth as everything else,
 * so a plain <a href> can't be used -- fetch it as a blob and trigger the
 * browser download manually via a throwaway anchor element.
 */
export async function downloadRelevePdf(appartementId: number, mois: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/appartements/${appartementId}/releve/pdf?mois=${mois}`, {
    headers: authHeaders(),
  })

  handleUnauthorized(response)

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.message ?? 'Une erreur est survenue.', response.status, data?.errors)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `releve-${mois}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
