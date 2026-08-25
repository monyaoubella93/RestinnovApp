export type SejourStatut = 'a_venir' | 'en_cours' | 'termine'

export type MissionStatut = 'a_faire' | 'en_cours' | 'en_attente_validation' | 'conforme' | 'non_conforme'

export type PlateformeOrigine = 'airbnb' | 'direct' | 'autre' | 'booking'

export type ProduitSignaleStatut = 'en_attente' | 'valide' | 'rejete'

export type TicketMaintenanceUrgence = 'basse' | 'normale' | 'haute'

export type TicketMaintenanceStatut =
  | 'ouvert'
  | 'assigne'
  | 'resolu_en_attente_validation'
  | 'resolu'
  | 'a_refaire'

export interface ChecklistModeleItem {
  id: number
  checklist_modele_id: number
  libelle: string
  photo_url: string | null
  ordre: number
}

export interface ChecklistModele {
  id: number
  nom: string
  items?: ChecklistModeleItem[]
}

export interface ChecklistItem {
  id: number
  mission_menage_id: number
  libelle: string
  checklist_modele_nom?: string | null
  coche: boolean
  photo_url: string | null
  photo_reference_url: string | null
  ordre: number
}

export type ModeGestion = 'mandat' | 'sous_location'

export interface Proprietaire {
  id: number
  nom: string
  telephone: string | null
  email: string | null
}

export interface Appartement {
  id: number
  nom: string
  adresse: string
  statut: string
  photo_principale: string | null
  agent_habituel_id: number | null
  proprietaire_id?: number | null
  mode_gestion?: ModeGestion
  taux_commission?: string | number | null
  loyer_fixe_mensuel?: string | number | null
  checklist_modeles?: ChecklistModele[]
  agent_habituel?: Agent | null
  proprietaire?: Proprietaire | null
  sejours_count?: number
  dernier_sejour?: string | null
}

export interface Agent {
  id: number
  nom: string
  role: string
  telephone: string | null
  adresse?: string | null
  actif?: boolean
  appartements_habituel_count?: number
  mission_menages_count?: number
}

export interface ProduitCatalogue {
  id: number
  nom: string
  prix: string | number
  photo_url: string | null
  actif: boolean
}

export type TypeUtilisationProduit = 'stock_existant' | 'rachete'

/**
 * Per-mission usage of a catalogue product, carried on the mission_menage_
 * produits pivot: "stock_existant" is free and needs no proof, "rachete"
 * requires a proof-of-purchase photo and the real prix_paye (never the
 * catalogue's generic prix).
 */
export interface ProduitUtilisationPivot {
  type_utilisation: TypeUtilisationProduit
  photo_url: string | null
  prix_paye: string | number | null
}

export interface ProduitCatalogueUtilise extends ProduitCatalogue {
  pivot: ProduitUtilisationPivot
}

export interface ProduitMenageSignale {
  id: number
  mission_menage_id: number
  photo_url: string
  note: string | null
  prix: string | number | null
  photo_ticket_url: string | null
  statut: ProduitSignaleStatut
  produit_catalogue_id: number | null
  produit_catalogue?: ProduitCatalogue | null
  mission_menage?: MissionMenage & { sejour?: Sejour }
}

export interface MissionMenageRefus {
  id: number
  motif: string | null
  motif_audio_url: string | null
  motif_photo_url: string | null
  vu: boolean
  created_at: string
}

export interface MissionMenagePhotoPreuve {
  id: number
  mission_menage_id: number
  photo_url: string
  note: string | null
  created_at: string
}

export interface MissionMenage {
  id: number
  sejour_id: number
  agent_id: number | null
  statut: MissionStatut
  agent: Agent | null
  frais_forfait: string | number
  vue: boolean
  created_at?: string
  produits?: ProduitCatalogueUtilise[]
  checklist_items?: ChecklistItem[]
  produits_signales?: ProduitMenageSignale[]
  photos_preuve?: MissionMenagePhotoPreuve[]
  sejour?: { id: number; appartement: Appartement | null } | null
  refus?: MissionMenageRefus[]
}

export interface TicketMaintenanceRefus {
  id: number
  motif: string | null
  motif_audio_url: string | null
  motif_photo_url: string | null
  vu: boolean
  created_at: string
  manager: { id: number; nom: string } | null
}

/**
 * The maintenance agent's own intermediate photo/audio/note message to the
 * Manager on an in-progress ticket -- distinct from the final resolution
 * (photo_apres/cout_reparation/note_resolution). Chronological, oldest first.
 */
export interface MessageAgentMaintenance {
  id: number
  photo_url: string | null
  audio_url: string | null
  note: string | null
  created_at: string
}

export interface TicketMaintenanceParAppartement {
  appartement: { id: number; nom: string; adresse: string } | null
  tickets_count: number
  cout_cumule: number
  recurrent: boolean
  tickets: TicketMaintenance[]
}

export interface TicketMaintenance {
  id: number
  reference: string
  appartement_id: number
  mission_origine_id: number | null
  agent_id: number | null
  description: string | null
  description_manager: string | null
  description_manager_audio_url: string | null
  photo_url: string | null
  photo_transferee: boolean
  audio_url: string | null
  photo_apres: string | null
  cout_reparation: string | number | null
  note_resolution: string | null
  urgence: TicketMaintenanceUrgence
  statut: TicketMaintenanceStatut
  created_at: string
  appartement?: Appartement | null
  agent?: Agent | null
  mission_origine?: (Omit<MissionMenage, 'sejour'> & { sejour?: Sejour | null }) | null
  refus?: TicketMaintenanceRefus[]
  messages_agent?: MessageAgentMaintenance[]
}

/**
 * The curated shape returned by GET /api/tickets-maintenance/mes-tickets --
 * deliberately narrower than TicketMaintenance: the menage agent's own
 * description/audio_url signalement fields are never sent to a maintenance
 * agent. Only the Manager-authored description_manager/
 * description_manager_audio_url are, plus the original photo_url, itself
 * only present when the Manager opted to transfer it (photo_transferee).
 * The refus array carries only motif+date, never the manager's identity.
 */
export interface MonTicketMaintenance {
  id: number
  reference: string
  statut: TicketMaintenanceStatut
  urgence: TicketMaintenanceUrgence
  description_manager: string | null
  description_manager_audio_url: string | null
  photo_url: string | null
  appartement: { id: number; nom: string; adresse: string } | null
  refus: { motif: string | null; motif_audio_url: string | null; motif_photo_url: string | null; vu: boolean; date: string }[]
  messages_agent: MessageAgentMaintenance[]
}

export type VoyageurType = 'adulte' | 'enfant'

export interface Voyageur {
  id?: number
  nom: string
  numero_passeport: string | null
  telephone: string | null
  est_principal: boolean
  type: VoyageurType
}

export interface FraisMaintenance {
  id: number
  sejour_id: number
  description: string
  prix: string | number
}

export interface Sejour {
  id: number
  reference: string
  appartement_id: number
  date_arrivee: string
  date_depart: string
  nom_voyageur: string
  statut: SejourStatut
  plateforme_origine: PlateformeOrigine
  montant_mad: string | number | null
  appartement?: Appartement
  mission_menage?: MissionMenage | null
  voyageurs?: Voyageur[]
  frais_maintenance?: FraisMaintenance[]
  voyageurs_count?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface DashboardAppartement {
  id: number
  nom: string
  statut: string
  sejours_count: number
  dernier_sejour: string | null
}

export interface DashboardSejourRecent {
  id: number
  nom_voyageur: string
  date_arrivee: string
  statut: SejourStatut
  appartement: { id: number; nom: string } | null
}

export interface DashboardDepartAujourdhui {
  id: number
  reference: string
  voyageur_principal: string
  telephone_voyageur: string | null
  appartement: { id: number; nom: string } | null
}

export interface DashboardProblemeSignale {
  id: number
  photo_url: string | null
  description: string | null
  urgence: TicketMaintenanceUrgence
  statut: TicketMaintenanceStatut
  appartement: { id: number; nom: string; adresse: string } | null
}

export interface DashboardMenageAValider {
  id: number
  sejour_id: number
  nom_voyageur: string | null
  appartement: { id: number; nom: string; adresse: string } | null
}

export interface DashboardResolutionAValider {
  id: number
  photo_apres: string | null
  cout_reparation: string | number | null
  description_manager: string | null
  statut: TicketMaintenanceStatut
  appartement: { id: number; nom: string; adresse: string } | null
}

export interface NotificationProblemeSignale {
  id: number
  urgence: TicketMaintenanceUrgence
  statut: TicketMaintenanceStatut
  appartement: { id: number; nom: string; adresse: string } | null
}

export interface NotificationsData {
  problemes_signales_count: number
  menages_a_valider_count: number
  problemes_signales: NotificationProblemeSignale[]
  menages_a_valider: DashboardMenageAValider[]
}

export interface DashboardData {
  revenus_totaux: number
  frais_menage_totaux: number
  frais_maintenance_totaux: number
  resultat_net: number
  appartements: DashboardAppartement[]
  sejours_par_statut: {
    a_venir: number
    en_cours: number
    termine: number
  }
  sejours_recents: DashboardSejourRecent[]
  departs_aujourdhui: DashboardDepartAujourdhui[]
  problemes_signales: DashboardProblemeSignale[]
  menages_a_valider: DashboardMenageAValider[]
  resolutions_a_valider: DashboardResolutionAValider[]
}

export interface CalendrierSejour {
  id: number
  reference: string
  nom_voyageur: string
  statut: SejourStatut
  appartement: { id: number; nom: string } | null
}

export interface CalendrierJour {
  date: string
  sejours: CalendrierSejour[]
}

export interface CalendrierData {
  mois: string
  jours: CalendrierJour[]
}

export interface ReleveSejour {
  id: number
  nom_voyageur: string
  date_arrivee: string
  date_depart: string
  montant_mad: number
}

export interface ReleveProduitDetail {
  nom: string
  prix: number
  photo_url: string | null
  type_utilisation: TypeUtilisationProduit
  photo_preuve_url: string | null
  prix_paye: number | null
}

export interface ReleveFraisMenageDetail {
  sejour_id: number
  nom_voyageur: string
  forfait: number
  produits: ReleveProduitDetail[]
}

export interface ReleveFraisMaintenanceDetail {
  sejour_id: number
  description: string | null
  prix: number
}

export interface Releve {
  appartement: {
    id: number
    nom: string
    adresse: string
    mode_gestion: ModeGestion
    taux_commission: string | number | null
    loyer_fixe_mensuel: string | number | null
    proprietaire: Proprietaire | null
  }
  mois: string
  revenus_bruts: number
  frais_menage_total: number
  frais_maintenance_total: number
  resultat_net: number
  montant_proprietaire: number
  commission_restinnov: number
  sejours: ReleveSejour[]
  frais_menage_detail: ReleveFraisMenageDetail[]
  frais_maintenance_detail: ReleveFraisMaintenanceDetail[]
}

export interface HistoriqueChecklistItem {
  libelle: string
  checklist_modele_nom: string | null
  coche: boolean
  photo_url: string | null
  photo_reference_url: string | null
}

export interface HistoriqueProduit {
  nom: string
  prix: number
  photo_url: string | null
  type_utilisation: TypeUtilisationProduit
  photo_preuve_url: string | null
  prix_paye: number | null
}

export interface HistoriqueMission {
  id: number
  statut: MissionStatut
  sejour: {
    id: number
    reference: string
    date_arrivee: string
    date_depart: string
    nom_voyageur: string
  }
  checklist_modeles_utilises: string[]
  checklist_items: HistoriqueChecklistItem[]
  produits: HistoriqueProduit[]
  frais_forfait: number
  frais_produits_total: number
  frais_total: number
}

/**
 * The menage agent's own "Historique" list -- GET /api/mes-missions/
 * historique -- always their own already-validated (conforme) missions,
 * one per appartement/sejour, with the checklist/produits detail so the
 * agent can revisit what they did.
 */
export interface HistoriqueMissionAgent {
  id: number
  sejour: {
    id: number
    reference: string
    date_arrivee: string
    date_depart: string
    nom_voyageur: string
  }
  appartement: { id: number; nom: string; adresse: string } | null
  checklist_modeles_utilises: string[]
  checklist_items: HistoriqueChecklistItem[]
  produits: HistoriqueProduit[]
}

/**
 * The maintenance agent's own "Validés" tab -- GET /api/tickets-maintenance/
 * mes-tickets/historique -- always their own already-resolved (resolu)
 * tickets, most recent first.
 */
export interface HistoriqueTicketAgent {
  id: number
  reference: string
  urgence: TicketMaintenanceUrgence
  description_manager: string | null
  photo_apres: string | null
  cout_reparation: string | number | null
  note_resolution: string | null
  appartement: { id: number; nom: string; adresse: string } | null
  messages_agent: MessageAgentMaintenance[]
}

/**
 * The Manager's own "Historique" view -- GET /api/mission-menages/historique
 * -- every already-validated (conforme) mission across every appartement,
 * optionally filtered by appartement and/or a sejour checkout date range.
 */
export interface HistoriqueMissionManager {
  id: number
  sejour: {
    id: number
    reference: string
    date_arrivee: string
    date_depart: string
    nom_voyageur: string
  }
  appartement: { id: number; nom: string; adresse: string } | null
  checklist_modeles_utilises: string[]
  checklist_items: HistoriqueChecklistItem[]
  produits: HistoriqueProduit[]
  frais_forfait: number
  frais_produits_total: number
  frais_total: number
}
