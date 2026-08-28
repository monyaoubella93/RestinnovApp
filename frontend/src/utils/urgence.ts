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
  basse: 'bg-gray-100 text-gray-600',
  normale: 'bg-blue-100 text-blue-800',
  haute: 'bg-red-100 text-red-800',
}

export const EN_RETARD_STYLE = 'bg-red-100 text-red-800'

export function formatDateLimite(dateLimite: string): string {
  return new Date(dateLimite).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
