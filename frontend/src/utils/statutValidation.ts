export type StatutValidationSemantique = 'en_attente' | 'refuse' | 'valide'

// Single source of truth for the validation-statut badge label/color
// everywhere a mission de ménage or ticket de maintenance's validation
// state is shown, on both agent workspaces, so the palette never drifts
// between /menage and /maintenance.
export const STATUT_VALIDATION_LABELS: Record<StatutValidationSemantique, string> = {
  en_attente: 'En attente de validation',
  refuse: 'Refusé',
  valide: 'Validé',
}

export const STATUT_VALIDATION_STYLES: Record<StatutValidationSemantique, string> = {
  en_attente: 'bg-violet-bg text-violet',
  refuse: 'bg-danger-bg text-danger',
  valide: 'bg-success-bg text-success-text',
}
