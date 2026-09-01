/**
 * Resolves the label an agent actually sees for a checklist task or
 * catalogue product name: the Arabic version only when the interface
 * language is Arabic AND that field was actually filled in by the Manager
 * for this specific entry -- otherwise always falls back to the French
 * label, so nothing ever renders empty.
 */
export function resolveLocalizedLabel(labelFr: string, labelAr: string | null | undefined, language: string): string {
  if (language === 'ar' && labelAr) return labelAr
  return labelFr
}
