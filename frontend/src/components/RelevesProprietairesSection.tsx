import { useEffect, useState } from 'react'
import {
  createChargeAppartement,
  deleteChargeAppartement,
  downloadRelevePdf,
  fetchAppartements,
  fetchReleve,
  updateProprietaire,
  type NewChargeAppartementInput,
  type NewProprietaireInput,
} from '../api'
import type { Appartement, ModeGestion, Proprietaire, Releve } from '../types'
import { ChargesAppartementModal } from './ChargesAppartementModal'
import { EditProprietaireModal } from './EditProprietaireModal'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMontant(value: number | undefined): string {
  return `${(value ?? 0).toFixed(2)} MAD`
}

const MODE_GESTION_LABELS: Record<ModeGestion, string> = {
  mandat: 'Mandat',
  sous_location: 'Sous-location',
}

const MODE_GESTION_STYLES: Record<ModeGestion, string> = {
  mandat: 'bg-brand-pale text-brand',
  sous_location: 'bg-violet-bg text-violet',
}

/**
 * Self-contained, like TicketsMaintenanceSection: fetches its own
 * appartements + one releve per appartement for the selected month,
 * independent of the lighter dashboard aggregate payload (which has no
 * proprietaire info).
 */
export function RelevesProprietairesSection() {
  const [mois, setMois] = useState(currentMonth())
  const [appartements, setAppartements] = useState<Appartement[]>([])
  const [releves, setReleves] = useState<Record<number, Releve>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [editingProprietaire, setEditingProprietaire] = useState<Proprietaire | null>(null)
  const [chargesAppartementId, setChargesAppartementId] = useState<number | null>(null)

  const reloadReleve = async (appartementId: number) => {
    const releve = await fetchReleve(appartementId, mois)
    setReleves((current) => ({ ...current, [appartementId]: releve }))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchAppartements()
      .then(async (data) => {
        if (cancelled) return
        setAppartements(data)

        const entries = await Promise.all(
          data.map(async (appartement) => [appartement.id, await fetchReleve(appartement.id, mois)] as const),
        )
        if (cancelled) return
        setReleves(Object.fromEntries(entries))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de charger les relevés.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mois])

  const handleSaveProprietaire = async (input: NewProprietaireInput) => {
    if (!editingProprietaire) return
    const updated = await updateProprietaire(editingProprietaire.id, input)
    setAppartements((current) =>
      current.map((appartement) =>
        appartement.proprietaire?.id === updated.id ? { ...appartement, proprietaire: updated } : appartement,
      ),
    )
    setReleves((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, releve]) => [
          id,
          releve.appartement.proprietaire?.id === updated.id
            ? { ...releve, appartement: { ...releve.appartement, proprietaire: updated } }
            : releve,
        ]),
      ),
    )
    setEditingProprietaire(null)
  }

  const handleAddCharge = async (appartementId: number, input: NewChargeAppartementInput) => {
    await createChargeAppartement(appartementId, input)
    await reloadReleve(appartementId)
  }

  const handleDeleteCharge = async (appartementId: number, chargeId: number) => {
    await deleteChargeAppartement(chargeId)
    await reloadReleve(appartementId)
  }

  const handleDownload = async (appartementId: number) => {
    setError(null)
    setDownloadingId(appartementId)
    try {
      await downloadRelevePdf(appartementId, mois)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de télécharger le PDF.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadAll = async () => {
    setError(null)
    setDownloadingAll(true)
    try {
      for (const appartement of appartements) {
        // eslint-disable-next-line no-await-in-loop -- sequential to avoid opening dozens of downloads at once
        await downloadRelevePdf(appartement.id, mois)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de télécharger tous les PDF.')
    } finally {
      setDownloadingAll(false)
    }
  }

  const relevesList = Object.values(releves)
  const totalRevenus = relevesList.reduce((sum, r) => sum + r.revenus_bruts, 0)
  const totalProprietaires = relevesList.reduce((sum, r) => sum + r.montant_proprietaire, 0)
  const totalCommission = relevesList.reduce((sum, r) => sum + r.commission_restinnov, 0)

  return (
    <div className="rounded-card-manager border border-border-default bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">Relevés propriétaires</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="releves_mois" className="sr-only">
            Mois
          </label>
          <input
            id="releves_mois"
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="rounded-field border border-border-default px-3 py-1.5 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll || appartements.length === 0}
            className="rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
          >
            {downloadingAll ? 'Génération...' : 'Générer tous les PDF'}
          </button>
        </div>
      </div>

      {!loading && !error && appartements.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-field border border-border-default p-3">
            <p className="text-xs font-semibold text-ink-tertiary">Revenus bruts</p>
            <p className="mt-1 font-mono text-lg font-bold text-ink">{formatMontant(totalRevenus)}</p>
          </div>
          <div className="rounded-field border border-border-default p-3">
            <p className="text-xs font-semibold text-ink-tertiary">Reversé aux propriétaires</p>
            <p className="mt-1 font-mono text-lg font-bold text-ink">{formatMontant(totalProprietaires)}</p>
          </div>
          <div className="rounded-field border border-border-default border-l-[3px] border-l-success p-3">
            <p className="text-xs font-semibold text-ink-tertiary">Commission Restinnov</p>
            <p className="mt-1 font-mono text-lg font-bold text-success-text">{formatMontant(totalCommission)}</p>
          </div>
        </div>
      )}

      {loading && <p className="mt-3 text-sm text-ink-tertiary">Chargement...</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {!loading && !error && appartements.length === 0 && (
        <p className="mt-3 text-sm text-ink-tertiary">Aucun appartement pour le moment.</p>
      )}

      {!loading && !error && appartements.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-border-default text-sm">
            <thead>
              <tr className="bg-table-header-bg text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-tertiary-2">
                <th className="py-2 pr-4 pl-2">Appartement</th>
                <th className="py-2 pr-4">Propriétaire</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4 text-right">Revenus</th>
                <th className="py-2 pr-4 text-right">Frais</th>
                <th className="py-2 pr-4 text-right">Montant dû</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {appartements.map((appartement) => {
                const releve = releves[appartement.id]
                const frais = releve
                  ? releve.frais_menage_total + releve.frais_maintenance_total + releve.charges_supplementaires_total
                  : 0
                const modeGestion = releve?.appartement.mode_gestion

                return (
                  <tr key={appartement.id}>
                    <td className="py-2 pr-4 pl-2 font-semibold text-ink">{appartement.nom}</td>
                    <td className="py-2 pr-4 text-ink-secondary">{appartement.proprietaire?.nom ?? 'Aucun'}</td>
                    <td className="py-2 pr-4">
                      {modeGestion && (
                        <span className={`rounded-badge px-2 py-0.5 text-xs font-bold ${MODE_GESTION_STYLES[modeGestion]}`}>
                          {MODE_GESTION_LABELS[modeGestion].toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-ink-secondary">{formatMontant(releve?.revenus_bruts)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-danger">{formatMontant(frais)}</td>
                    <td className="py-2 pr-4 text-right font-mono font-bold text-ink">
                      {formatMontant(releve?.montant_proprietaire)}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleDownload(appartement.id)}
                          disabled={downloadingId === appartement.id}
                          className="text-sm font-semibold text-brand-light hover:text-brand disabled:opacity-50"
                        >
                          {downloadingId === appartement.id ? 'Téléchargement...' : 'Télécharger PDF'}
                        </button>
                        {appartement.proprietaire && (
                          <button
                            type="button"
                            onClick={() => setEditingProprietaire(appartement.proprietaire!)}
                            className="text-sm font-semibold text-ink-secondary hover:text-ink"
                          >
                            Propriétaire
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setChargesAppartementId(appartement.id)}
                          className="text-sm font-semibold text-ink-secondary hover:text-ink"
                        >
                          Charges
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingProprietaire && (
        <EditProprietaireModal
          proprietaire={editingProprietaire}
          onCancel={() => setEditingProprietaire(null)}
          onSave={handleSaveProprietaire}
        />
      )}

      {chargesAppartementId != null && (
        <ChargesAppartementModal
          appartementNom={appartements.find((a) => a.id === chargesAppartementId)?.nom ?? ''}
          mois={mois}
          charges={releves[chargesAppartementId]?.charges_supplementaires_detail ?? []}
          onClose={() => setChargesAppartementId(null)}
          onAdd={(input) => handleAddCharge(chargesAppartementId, input)}
          onDelete={(chargeId) => handleDeleteCharge(chargesAppartementId, chargeId)}
        />
      )}
    </div>
  )
}
