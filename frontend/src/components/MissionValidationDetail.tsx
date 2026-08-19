import { useState } from 'react'
import { resolveStorageUrl } from '../api'
import type { MissionMenage } from '../types'
import { ProduitSignaleCard } from './ProduitsSignalesSection'

const PRODUIT_STATUT_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  valide: 'Validé',
  rejete: 'Rejeté',
}

const PRODUIT_STATUT_STYLES: Record<string, string> = {
  en_attente: 'bg-warning-bg text-warning-text',
  valide: 'bg-success-bg text-success-text',
  rejete: 'bg-danger-bg text-danger',
}

interface MissionValidationDetailProps {
  mission: MissionMenage
  onValiderProduitSignale?: (id: number, input: { nom: string; prix: number }) => Promise<void>
  onRejeterProduitSignale?: (id: number) => Promise<void>
}

/**
 * The Manager-facing detail behind "Valider": the full checklist (coché or
 * not, with its proof photo when the agent attached one), every photo the
 * agent attached as work proof, and every product the agent signaled during
 * the mission -- so validating is an informed decision, not a blind click.
 * Products still "en_attente" can be validated (nom+prix) or rejected right
 * here, without leaving this screen for the separate catalogue tab.
 */
export function MissionValidationDetail({
  mission,
  onValiderProduitSignale,
  onRejeterProduitSignale,
}: MissionValidationDetailProps) {
  const [expanded, setExpanded] = useState(false)
  const checklistItems = mission.checklist_items ?? []
  const produitsSignales = mission.produits_signales ?? []
  const photosPreuve = mission.photos_preuve ?? []

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="text-sm font-semibold text-brand-light hover:text-brand"
      >
        {expanded ? 'Masquer le détail' : 'Voir le détail'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-4 rounded-field border border-border-default bg-surface p-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">Checklist</p>
            {checklistItems.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">Aucun item de checklist.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {checklistItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
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

          {photosPreuve.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
                Photos de preuve du travail
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {photosPreuve.map((photo) => (
                  <li key={photo.id}>
                    <img
                      src={resolveStorageUrl(photo.photo_url)}
                      alt="Photo de preuve du travail"
                      className="h-16 w-16 rounded-[8px] object-cover"
                    />
                    {photo.note && <p className="mt-1 max-w-[4rem] truncate text-xs text-ink-tertiary">{photo.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">Produits signalés</p>
            {produitsSignales.length === 0 ? (
              <p className="mt-1 text-sm text-ink-tertiary">Aucun produit signalé.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {produitsSignales.map((produit) =>
                  produit.statut === 'en_attente' && onValiderProduitSignale && onRejeterProduitSignale ? (
                    <ProduitSignaleCard
                      key={produit.id}
                      produitSignale={produit}
                      onValider={onValiderProduitSignale}
                      onRejeter={onRejeterProduitSignale}
                    />
                  ) : (
                    <li key={produit.id} className="flex items-center gap-3 text-sm">
                      <img
                        src={resolveStorageUrl(produit.photo_url)}
                        alt="Photo du produit signalé"
                        className="h-10 w-10 shrink-0 rounded-[8px] object-cover"
                      />
                      <div className="min-w-0">
                        {produit.note && <p className="truncate text-ink-secondary">{produit.note}</p>}
                        <span
                          className={`inline-block rounded-badge px-2 py-0.5 text-xs font-medium ${
                            PRODUIT_STATUT_STYLES[produit.statut] ?? 'bg-table-header-bg text-ink-tertiary'
                          }`}
                        >
                          {PRODUIT_STATUT_LABELS[produit.statut] ?? produit.statut}
                        </span>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
