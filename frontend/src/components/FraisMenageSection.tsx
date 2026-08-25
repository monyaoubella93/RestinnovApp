import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type UpdateProduitUtiliseInput, resolveStorageUrl } from '../api'
import type { MissionMenage, ProduitCatalogue } from '../types'
import { friendlyUploadErrorMessage } from '../utils/uploadError'

interface FraisMenageSectionProps {
  missionMenage: MissionMenage
  catalogue: ProduitCatalogue[]
  onUpdateProduits: (missionMenageId: number, input: { frais_forfait: number }) => Promise<void>
  onUpdateProduitUtilise: (missionMenageId: number, produitId: number, input: UpdateProduitUtiliseInput) => Promise<void>
  onDetacherProduit: (missionMenageId: number, produitId: number) => Promise<void>
  onSignalerProduit: (
    missionMenageId: number,
    input: { photo: File; note?: string | null; prix?: number | null; photoTicket?: File | null },
  ) => Promise<void>
  /**
   * The Manager's screens embed this same component to adjust frais_forfait
   * post-checkout, but choosing stock_existant/racheté (with its
   * photo/prix proof) and signaling a new product are exclusively the
   * agent's own record of what happened during the mission -- the Manager
   * only ever reviews it. readOnly strips every produits-related input down
   * to the plain badges (or "en attente" for a product the agent hasn't
   * resolved yet) and removes the "signaler un nouveau produit" form
   * entirely, while the forfait field/total stay editable either way.
   */
  readOnly?: boolean
}

export function FraisMenageSection({
  missionMenage,
  catalogue,
  onUpdateProduits,
  onUpdateProduitUtilise,
  onDetacherProduit,
  onSignalerProduit,
  readOnly = false,
}: FraisMenageSectionProps) {
  const { t } = useTranslation()
  const [forfait, setForfait] = useState(String(missionMenage.frais_forfait))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [racheteFormProduitId, setRacheteFormProduitId] = useState<number | null>(null)
  const [rachetePhoto, setRachetePhoto] = useState<File | null>(null)
  const [rachetePrix, setRachetePrix] = useState('')
  const [savingProduitId, setSavingProduitId] = useState<number | null>(null)
  const [produitErrors, setProduitErrors] = useState<Record<number, string>>({})

  const [showSignalerForm, setShowSignalerForm] = useState(false)
  const [signalerPhoto, setSignalerPhoto] = useState<File | null>(null)
  const [signalerNote, setSignalerNote] = useState('')
  const [signalerPrix, setSignalerPrix] = useState('')
  const [signalerPhotoTicket, setSignalerPhotoTicket] = useState<File | null>(null)
  const [signalerSubmitting, setSignalerSubmitting] = useState(false)
  const [signalerError, setSignalerError] = useState<string | null>(null)
  const [signalerSuccess, setSignalerSuccess] = useState(false)

  const catalogueActif = catalogue.filter((p) => p.actif)
  const produitsUtilises = missionMenage.produits ?? []

  const totalFraisMenage =
    (Number(forfait) || 0) +
    produitsUtilises
      .filter((p) => p.pivot.type_utilisation === 'rachete')
      .reduce((sum, p) => sum + (Number(p.pivot.prix_paye) || 0), 0)

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await onUpdateProduits(missionMenage.id, { frais_forfait: Number(forfait) || 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.genericError'))
    } finally {
      setSaving(false)
    }
  }

  const handleStockExistant = async (produitId: number) => {
    setProduitErrors((current) => ({ ...current, [produitId]: '' }))
    setSavingProduitId(produitId)
    try {
      await onUpdateProduitUtilise(missionMenage.id, produitId, { type_utilisation: 'stock_existant' })
    } catch (err) {
      setProduitErrors((current) => ({
        ...current,
        [produitId]: err instanceof Error ? err.message : t('common.genericError'),
      }))
    } finally {
      setSavingProduitId(null)
    }
  }

  const openRacheteForm = (produitId: number) => {
    setRacheteFormProduitId(produitId)
    setRachetePhoto(null)
    setRachetePrix('')
    setProduitErrors((current) => ({ ...current, [produitId]: '' }))
  }

  const handleValiderRachete = async (produitId: number) => {
    if (!rachetePhoto || !rachetePrix) {
      setProduitErrors((current) => ({ ...current, [produitId]: t('menage.frais.racheteRequiert') }))
      return
    }

    setSavingProduitId(produitId)
    try {
      await onUpdateProduitUtilise(missionMenage.id, produitId, {
        type_utilisation: 'rachete',
        photo: rachetePhoto,
        prix_paye: Number(rachetePrix) || 0,
      })
      setRacheteFormProduitId(null)
    } catch (err) {
      setProduitErrors((current) => ({
        ...current,
        [produitId]: friendlyUploadErrorMessage(err, {
          tooLarge: t('menage.frais.photoTooLarge'),
          generic: t('common.genericError'),
        }),
      }))
    } finally {
      setSavingProduitId(null)
    }
  }

  const handleRetirer = async (produitId: number) => {
    setSavingProduitId(produitId)
    try {
      await onDetacherProduit(missionMenage.id, produitId)
    } catch (err) {
      setProduitErrors((current) => ({
        ...current,
        [produitId]: err instanceof Error ? err.message : t('common.genericError'),
      }))
    } finally {
      setSavingProduitId(null)
    }
  }

  const handleSignaler = async () => {
    setSignalerError(null)
    if (!signalerPhoto) {
      setSignalerError(t('menage.frais.photoRequise'))
      return
    }
    if (!signalerPrix && !signalerPhotoTicket) {
      setSignalerError(t('menage.frais.prixOuTicketRequis'))
      return
    }

    setSignalerSubmitting(true)
    try {
      await onSignalerProduit(missionMenage.id, {
        photo: signalerPhoto,
        note: signalerNote.trim() ? signalerNote : null,
        prix: signalerPrix ? Number(signalerPrix) : null,
        photoTicket: signalerPhotoTicket,
      })
      setSignalerPhoto(null)
      setSignalerNote('')
      setSignalerPrix('')
      setSignalerPhotoTicket(null)
      setShowSignalerForm(false)
      setSignalerSuccess(true)
    } catch (err) {
      setSignalerError(
        friendlyUploadErrorMessage(err, {
          tooLarge: t('menage.frais.photoTooLarge'),
          generic: t('common.genericError'),
        }),
      )
    } finally {
      setSignalerSubmitting(false)
    }
  }

  return (
    <div className="mt-3 rounded-field border border-border-default p-3">
      <p className="text-sm font-bold text-ink">{t('menage.frais.title')}</p>

      <div className="mt-2">
        <label htmlFor={`forfait_${missionMenage.id}`} className="block text-sm font-semibold text-ink-secondary">
          {t('menage.frais.forfait')}
        </label>
        <input
          id={`forfait_${missionMenage.id}`}
          type="number"
          min="0"
          step="0.01"
          value={forfait}
          onChange={(e) => setForfait(e.target.value)}
          className="mt-1 block w-32 rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      {error && <p className="mt-1 text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-2 rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
      >
        {saving ? t('menage.frais.saving') : t('menage.frais.save')}
      </button>

      {catalogueActif.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-tertiary-2">
            {t('menage.frais.produitsTitle')}
          </p>
          <div className="mt-2 space-y-2">
            {catalogueActif.map((produit) => {
              const utilise = produitsUtilises.find((p) => p.id === produit.id)
              const busy = savingProduitId === produit.id
              const produitError = produitErrors[produit.id]

              return (
                <div key={produit.id} className="rounded-field border border-border-default px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {produit.photo_url && (
                      <img
                        src={resolveStorageUrl(produit.photo_url)}
                        alt={t('menage.frais.photoOf', { nom: produit.nom })}
                        className="h-6 w-6 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="flex-1 text-ink">{produit.nom}</span>

                    {utilise ? (
                      utilise.pivot.type_utilisation === 'stock_existant' ? (
                        <span
                          data-testid={`produit-badge-${produit.id}`}
                          className="rounded-badge bg-table-header-bg px-2 py-0.5 text-xs font-medium text-ink-tertiary"
                        >
                          {t('menage.frais.stockExistantBadge')}
                        </span>
                      ) : (
                        <span
                          data-testid={`produit-badge-${produit.id}`}
                          className="flex items-center gap-1 rounded-badge bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text"
                        >
                          {utilise.pivot.photo_url && (
                            <img
                              src={resolveStorageUrl(utilise.pivot.photo_url)}
                              alt={t('menage.frais.photoPreuveAlt', { nom: produit.nom })}
                              className="h-5 w-5 rounded object-cover"
                            />
                          )}
                          {t('menage.frais.racheteBadge')} · {Number(utilise.pivot.prix_paye ?? 0).toFixed(2)} MAD
                        </span>
                      )
                    ) : readOnly ? (
                      <span className="text-xs font-medium text-ink-tertiary">{t('menage.frais.enAttenteAgent')}</span>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label={t('menage.frais.stockExistantAria')}
                          onClick={() => handleStockExistant(produit.id)}
                          disabled={busy}
                          className="rounded-field border border-border-default px-2 py-1 text-base hover:bg-table-header-bg disabled:opacity-50"
                        >
                          📦
                        </button>
                        <button
                          type="button"
                          aria-label={t('menage.frais.racheteAria')}
                          onClick={() => openRacheteForm(produit.id)}
                          disabled={busy}
                          className="rounded-field border border-border-default px-2 py-1 text-base hover:bg-table-header-bg disabled:opacity-50"
                        >
                          🛒
                        </button>
                      </div>
                    )}

                    {utilise && !readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRetirer(produit.id)}
                        disabled={busy}
                        className="shrink-0 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                      >
                        {t('menage.frais.retirerProduit')}
                      </button>
                    )}
                  </div>

                  {!readOnly && racheteFormProduitId === produit.id && (
                    <div className="mt-2 space-y-2 border-t border-border-light pt-2">
                      <label
                        htmlFor={`rachete_photo_${produit.id}`}
                        className="block text-sm font-semibold text-ink-secondary"
                      >
                        {t('menage.frais.photoPreuveAchat')}
                      </label>
                      <input
                        id={`rachete_photo_${produit.id}`}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(e) => setRachetePhoto(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm"
                      />
                      <label
                        htmlFor={`rachete_prix_${produit.id}`}
                        className="block text-sm font-semibold text-ink-secondary"
                      >
                        {t('menage.frais.prixPaye')}
                      </label>
                      <input
                        id={`rachete_prix_${produit.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={rachetePrix}
                        onChange={(e) => setRachetePrix(e.target.value)}
                        className="block w-32 rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRacheteFormProduitId(null)}
                          className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
                        >
                          {t('menage.frais.annulerRachete')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValiderRachete(produit.id)}
                          disabled={busy}
                          className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          {t('menage.frais.validerProduit')}
                        </button>
                      </div>
                    </div>
                  )}

                  {produitError && <p className="mt-1 text-sm text-danger">{produitError}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p
        className="mt-3 font-mono text-sm font-bold text-ink"
        data-testid={`total-frais-menage-${missionMenage.id}`}
      >
        {t('menage.frais.total', { montant: totalFraisMenage.toFixed(2) })}
      </p>

      {!readOnly && (
      <div className="mt-3 border-t border-border-light pt-3">
        {!showSignalerForm ? (
          <button
            type="button"
            onClick={() => {
              setShowSignalerForm(true)
              setSignalerSuccess(false)
            }}
            className="text-sm font-semibold text-brand-light hover:text-brand"
          >
            {t('menage.frais.signalerNouveau')}
          </button>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor={`signaler_photo_${missionMenage.id}`}
              className="block text-sm font-semibold text-ink-secondary"
            >
              {t('menage.frais.photoProduit')}
            </label>
            <input
              id={`signaler_photo_${missionMenage.id}`}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setSignalerPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <p className="text-xs text-ink-tertiary">{t('menage.frais.prixOuTicketHint')}</p>
            <label htmlFor={`signaler_prix_${missionMenage.id}`} className="block text-sm font-semibold text-ink-secondary">
              {t('menage.frais.prixPaye')}
            </label>
            <input
              id={`signaler_prix_${missionMenage.id}`}
              type="number"
              min="0"
              step="0.01"
              value={signalerPrix}
              onChange={(e) => setSignalerPrix(e.target.value)}
              className="block w-32 rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            <label
              htmlFor={`signaler_photo_ticket_${missionMenage.id}`}
              className="block text-sm font-semibold text-ink-secondary"
            >
              {t('menage.frais.photoTicket')}
            </label>
            <input
              id={`signaler_photo_ticket_${missionMenage.id}`}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setSignalerPhotoTicket(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <label htmlFor={`signaler_note_${missionMenage.id}`} className="block text-sm font-semibold text-ink-secondary">
              {t('common.optionalNote')}
            </label>
            <input
              id={`signaler_note_${missionMenage.id}`}
              type="text"
              value={signalerNote}
              onChange={(e) => setSignalerNote(e.target.value)}
              className="block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            {signalerError && <p className="text-sm text-danger">{signalerError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSignalerForm(false)}
                className="rounded-field border border-border-default px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-table-header-bg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSignaler}
                disabled={signalerSubmitting}
                className="rounded-field bg-success px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
              >
                {signalerSubmitting ? t('common.sending') : t('common.send')}
              </button>
            </div>
          </div>
        )}
        {signalerSuccess && <p className="mt-2 text-sm text-success-text">{t('menage.frais.signale')}</p>}
      </div>
      )}
    </div>
  )
}
