import { useEffect, useState } from 'react'
import { fetchAppartementHistorique, resolveStorageUrl } from '../api'
import type { HistoriqueMission } from '../types'

interface AppartementHistoriqueSectionProps {
  appartementId: number
}

const STATUT_LABELS: Record<string, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  en_attente_validation: 'En attente de validation',
  conforme: 'Conforme',
  non_conforme: 'Non conforme',
}

const STATUT_STYLES: Record<string, string> = {
  a_faire: 'bg-table-header-bg text-ink-tertiary',
  en_cours: 'bg-warning-bg text-warning-text',
  en_attente_validation: 'bg-violet-bg text-violet',
  conforme: 'bg-success-bg text-success-text',
  non_conforme: 'bg-danger-bg text-danger',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR')
}

function formatMad(value: number): string {
  return `${value.toFixed(2)} MAD`
}

function MissionRow({ mission }: { mission: HistoriqueMission }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="rounded-card-manager border border-border-default bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-tertiary">{mission.sejour.reference}</p>
          <p className="font-semibold text-ink">{mission.sejour.nom_voyageur}</p>
          <p className="font-mono text-sm text-ink-tertiary">
            {formatDate(mission.sejour.date_arrivee)} → {formatDate(mission.sejour.date_depart)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-badge px-2 py-0.5 text-xs font-bold ${
            STATUT_STYLES[mission.statut] ?? 'bg-table-header-bg text-ink-tertiary'
          }`}
        >
          {STATUT_LABELS[mission.statut] ?? mission.statut}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border-light px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
              Checklist{mission.checklist_modeles_utilises.length > 0 ? ` (${mission.checklist_modeles_utilises.join(', ')})` : ''}
            </p>
            {mission.checklist_items.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">Aucun item de checklist.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {mission.checklist_items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <span
                      aria-label={item.coche ? 'Coché' : 'Non coché'}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        item.coche ? 'bg-success text-white' : 'border border-border-default text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={item.coche ? 'text-ink-secondary' : 'text-ink-tertiary'}>{item.libelle}</span>
                    {item.photo_url && (
                      <img
                        src={resolveStorageUrl(item.photo_url)}
                        alt={`Photo de "${item.libelle}"`}
                        className="h-8 w-8 rounded object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">Produits utilisés</p>
            {mission.produits.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">Aucun produit.</p>
            ) : (
              <ul className="mt-1 font-mono text-sm text-ink-secondary">
                {mission.produits.map((produit, index) => (
                  <li key={index}>
                    {produit.nom} — {produit.type_utilisation === 'stock_existant' ? 'Déjà présent' : formatMad(produit.prix_paye ?? 0)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="font-mono text-sm text-ink-secondary">
            <p>Forfait : {formatMad(mission.frais_forfait)}</p>
            <p>Produits : {formatMad(mission.frais_produits_total)}</p>
            <p className="font-bold text-ink">Total : {formatMad(mission.frais_total)}</p>
          </div>
        </div>
      )}
    </li>
  )
}

export function AppartementHistoriqueSection({ appartementId }: AppartementHistoriqueSectionProps) {
  const [missions, setMissions] = useState<HistoriqueMission[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAppartementHistorique(appartementId)
      .then((data) => {
        if (!cancelled) setMissions(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Impossible de charger l'historique.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [appartementId])

  if (loading) {
    return <p className="text-sm text-ink-tertiary">Chargement de l'historique...</p>
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>
  }

  if (!missions || missions.length === 0) {
    return <p className="text-sm text-ink-tertiary">Aucune mission de ménage pour cet appartement.</p>
  }

  return <ul className="space-y-2">{missions.map((mission) => <MissionRow key={mission.id} mission={mission} />)}</ul>
}
