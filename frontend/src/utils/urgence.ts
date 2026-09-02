import type { TicketMaintenanceUrgence } from '../types'

// Single source of truth for the urgence badge label/color everywhere a
// maintenance ticket's urgence is shown (Dashboard, tickets list, agent
// workspace, historique) so the palette never drifts between screens.
export const URGENCE_LABELS: Record<TicketMaintenanceUrgence, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
}

export const URGENCE_STYLES: Record<TicketMaintenanceUrgence, string> = {
  basse: 'bg-table-header-bg text-ink-tertiary',
  normale: 'bg-brand-pale text-brand',
  haute: 'bg-danger-bg text-danger',
}

// Replaces the urgence badge entirely once a ticket's deadline has passed
// (see TicketMaintenance.est_en_retard) -- never shown alongside it.
export const EN_RETARD_STYLE = 'bg-danger-bg text-danger'

export function formatDateLimite(dateLimite: string): string {
  return new Date(dateLimite).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
