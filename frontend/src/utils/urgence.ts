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
