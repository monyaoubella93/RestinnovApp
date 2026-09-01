import { useState } from 'react'
import { resolveStorageUrl } from '../api'
import type { MissionMenage, ProduitCatalogue } from '../types'
import { PhotoLightbox } from './PhotoLightbox'
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
  /**
   * Full active catalogue, so every product can be listed here -- not just
   * the ones the agent already resolved -- with "En attente de la femme de
   * ménage" for anything she hasn't gotten to yet. This screen is
   * Manager-facing and strictly read-only for produits utilisés: choosing
   * stock_existant/racheté (with its photo/prix proof) is exclusively the
   * agent's own record of the mission, never something the Manager fills in
   * on her behalf -- see FraisMenageSection's own readOnly mode for the
   * agent-facing input this deliberately has none of.
   */
  catalogue?: ProduitCatalogue[]
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
  catalogue,
  onValiderProduitSignale,
  onRejeterProduitSignale,
}: MissionValidationDetailProps) {
  const [expanded, setExpanded] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; alt: string } | null>(null)
  const checklistItems = mission.checklist_items ?? []
  // Only pending signalements belong here -- once a product is validated or
  // rejected it's treated, and this section (nom/prix fields + "Valider ce
  // produit") stops being relevant to it.
  const produitsSignalesEnAttente = (mission.produits_signales ?? []).filter(
    (produit) => produit.statut === 'en_attente',
  )
  const photosPreuve = mission.photos_preuve ?? []
  const produitsUtilises = mission.produits ?? []
  const catalogueActif = (catalogue ?? []).filter((p) => p.actif)

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
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxPhoto({
                            src: resolveStorageUrl(item.photo_url!),
                            alt: `Photo de "${item.libelle}"`,
                          })
                        }
                        aria-label={`Agrandir la photo de "${item.libelle}"`}
                        className="shrink-0 overflow-hidden rounded transition hover:opacity-80"
                      >
                        <img
                          src={resolveStorageUrl(item.photo_url)}
                          alt={`Photo de "${item.libelle}"`}
                          className="h-8 w-8 object-cover"
                        />
                      </button>
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
              <ul className="mt-2 flex flex-wrap gap-3">
                {photosPreuve.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxPhoto({
                          src: resolveStorageUrl(photo.photo_url),
                          alt: 'Photo de preuve du travail',
                        })
                      }
                      aria-label="Agrandir la photo de preuve du travail"
                      className="overflow-hidden rounded-[8px] transition hover:opacity-80"
                    >
                      <img
                        src={resolveStorageUrl(photo.photo_url)}
                        alt="Photo de preuve du travail"
                        className="h-24 w-24 object-cover"
                      />
                    </button>
                    {photo.note && <p className="mt-1 max-w-[6rem] truncate text-xs text-ink-tertiary">{photo.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {catalogueActif.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">Produits utilisés</p>
              <ul className="mt-2 space-y-2">
                {catalogueActif.map((produitCatalogue) => {
                  const produit = produitsUtilises.find((p) => p.id === produitCatalogue.id)

                  return (
                    <li key={produitCatalogue.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-ink-secondary">{produitCatalogue.nom}</span>
                      {!produit ? (
                        <span className="text-xs font-medium text-ink-tertiary">En attente de la femme de ménage</span>
                      ) : produit.pivot.type_utilisation === 'stock_existant' ? (
                        <span className="rounded-badge bg-table-header-bg px-2 py-0.5 text-xs font-medium text-ink-tertiary">
                          Déjà présent
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-badge bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
                          {produit.pivot.photo_url && (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxPhoto({
                                  src: resolveStorageUrl(produit.pivot.photo_url!),
                                  alt: `Photo preuve d'achat de "${produit.nom}"`,
                                })
                              }
                              aria-label={`Agrandir la photo preuve d'achat de "${produit.nom}"`}
                              className="overflow-hidden rounded transition hover:opacity-80"
                            >
                              <img
                                src={resolveStorageUrl(produit.pivot.photo_url)}
                                alt={`Photo preuve d'achat de "${produit.nom}"`}
                                className="h-5 w-5 object-cover"
                              />
                            </button>
                          )}
                          Racheté · {Number(produit.pivot.prix_paye ?? 0).toFixed(2)} MAD
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {produitsSignalesEnAttente.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
                Produits signalés pour cette mission
              </p>
              <ul className="mt-2 space-y-2">
                {produitsSignalesEnAttente.map((produit) =>
                  onValiderProduitSignale && onRejeterProduitSignale ? (
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
            </div>
          )}
        </div>
      )}

      {lightboxPhoto && (
        <PhotoLightbox src={lightboxPhoto.src} alt={lightboxPhoto.alt} onClose={() => setLightboxPhoto(null)} />
      )}
    </div>
  )
}
