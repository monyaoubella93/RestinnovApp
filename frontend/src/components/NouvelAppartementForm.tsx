import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import type { NewAppartementInput, NewProprietaireInput } from '../api'
import type { Agent, Appartement, ChecklistModele, ModeGestion, Proprietaire } from '../types'
import { ChecklistModeleItemsEditor } from './ChecklistModeleItemsEditor'

interface NouvelAppartementFormProps {
  checklistModeles: ChecklistModele[]
  agentsMenage: Agent[]
  proprietaires: Proprietaire[]
  onSubmit: (input: NewAppartementInput) => Promise<void>
  onCreateProprietaire: (input: NewProprietaireInput) => Promise<Proprietaire>
  onCreateChecklistModele: (nom: string) => Promise<ChecklistModele>
  onAddChecklistModeleItem: (checklistModeleId: number, libelle: string, photo?: File | null) => Promise<void>
  onDeplacerChecklistModeleItem: (itemId: number, direction: 'haut' | 'bas') => Promise<void>
  onDeleteChecklistModeleItem: (itemId: number) => Promise<void>
  onCancel?: () => void
  appartementToEdit?: Appartement | null
}

const STATUT_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  occupe: 'Occupé',
  en_menage: 'En ménage',
}

export function NouvelAppartementForm({
  checklistModeles,
  agentsMenage,
  proprietaires,
  onSubmit,
  onCreateProprietaire,
  onCreateChecklistModele,
  onAddChecklistModeleItem,
  onDeplacerChecklistModeleItem,
  onDeleteChecklistModeleItem,
  onCancel,
  appartementToEdit,
}: NouvelAppartementFormProps) {
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [checklistModeleIds, setChecklistModeleIds] = useState<number[]>([])
  const [agentHabituelId, setAgentHabituelId] = useState('')
  const [showNewChecklistInput, setShowNewChecklistInput] = useState(false)
  const [newChecklistNom, setNewChecklistNom] = useState('')
  const [creatingChecklist, setCreatingChecklist] = useState(false)
  const [proprietaireId, setProprietaireId] = useState('')
  const [showNewProprietaireInput, setShowNewProprietaireInput] = useState(false)
  const [newProprietaireNom, setNewProprietaireNom] = useState('')
  const [newProprietaireTelephone, setNewProprietaireTelephone] = useState('')
  const [newProprietaireEmail, setNewProprietaireEmail] = useState('')
  const [creatingProprietaire, setCreatingProprietaire] = useState(false)
  const [modeGestion, setModeGestion] = useState<ModeGestion>('mandat')
  const [tauxCommission, setTauxCommission] = useState('')
  const [loyerFixeMensuel, setLoyerFixeMensuel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setNom('')
    setAdresse('')
    setPhoto(null)
    setChecklistModeleIds([])
    setAgentHabituelId('')
    setShowNewChecklistInput(false)
    setNewChecklistNom('')
    setProprietaireId('')
    setShowNewProprietaireInput(false)
    setNewProprietaireNom('')
    setNewProprietaireTelephone('')
    setNewProprietaireEmail('')
    setModeGestion('mandat')
    setTauxCommission('')
    setLoyerFixeMensuel('')
    setError(null)
  }

  useEffect(() => {
    if (appartementToEdit) {
      setNom(appartementToEdit.nom)
      setAdresse(appartementToEdit.adresse)
      setPhoto(null)
      setChecklistModeleIds((appartementToEdit.checklist_modeles ?? []).map((modele) => modele.id))
      setAgentHabituelId(appartementToEdit.agent_habituel_id ? String(appartementToEdit.agent_habituel_id) : '')
      setProprietaireId(appartementToEdit.proprietaire_id ? String(appartementToEdit.proprietaire_id) : '')
      setModeGestion(appartementToEdit.mode_gestion ?? 'mandat')
      setTauxCommission(
        appartementToEdit.taux_commission != null ? String(appartementToEdit.taux_commission) : '',
      )
      setLoyerFixeMensuel(
        appartementToEdit.loyer_fixe_mensuel != null ? String(appartementToEdit.loyer_fixe_mensuel) : '',
      )
      setError(null)
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appartementToEdit])

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Seuls les fichiers JPG ou PNG sont acceptés.')
      return
    }
    setError(null)
    setPhoto(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    acceptFile(event.dataTransfer.files[0])
  }

  const toggleChecklistModele = (modeleId: number) => {
    setChecklistModeleIds((current) =>
      current.includes(modeleId) ? current.filter((id) => id !== modeleId) : [...current, modeleId],
    )
  }

  const handleCreateChecklistModele = async () => {
    if (!newChecklistNom.trim()) return
    setCreatingChecklist(true)
    try {
      const created = await onCreateChecklistModele(newChecklistNom.trim())
      setChecklistModeleIds((current) => [...current, created.id])
      setShowNewChecklistInput(false)
      setNewChecklistNom('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce modèle.')
    } finally {
      setCreatingChecklist(false)
    }
  }

  const handleCreateProprietaire = async () => {
    if (!newProprietaireNom.trim()) return
    setCreatingProprietaire(true)
    try {
      const created = await onCreateProprietaire({
        nom: newProprietaireNom.trim(),
        telephone: newProprietaireTelephone.trim() || null,
        email: newProprietaireEmail.trim() || null,
      })
      setProprietaireId(String(created.id))
      setShowNewProprietaireInput(false)
      setNewProprietaireNom('')
      setNewProprietaireTelephone('')
      setNewProprietaireEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer ce propriétaire.')
    } finally {
      setCreatingProprietaire(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!nom.trim() || !adresse.trim()) {
      setError('Le nom et l’adresse sont obligatoires.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        nom,
        adresse,
        photo,
        checklist_modele_ids: checklistModeleIds,
        agent_habituel_id: agentHabituelId ? Number(agentHabituelId) : null,
        proprietaire_id: proprietaireId ? Number(proprietaireId) : null,
        mode_gestion: modeGestion,
        taux_commission: modeGestion === 'mandat' && tauxCommission ? Number(tauxCommission) : null,
        loyer_fixe_mensuel: modeGestion === 'sous_location' && loyerFixeMensuel ? Number(loyerFixeMensuel) : null,
      })
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-card-manager border border-border-default bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">
        {appartementToEdit ? "Modifier l'appartement" : 'Nouvel appartement'}
      </h2>

      <div>
        <label htmlFor="appartement_nom" className="block text-sm font-semibold text-ink-secondary">
          Nom d'appartement
        </label>
        <input
          id="appartement_nom"
          type="text"
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="ex. Zenith 3ème étage"
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="appartement_adresse" className="block text-sm font-semibold text-ink-secondary">
          Adresse complète
        </label>
        <input
          id="appartement_adresse"
          type="text"
          required
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        />
      </div>

      <div>
        <span className="block text-sm font-semibold text-ink-secondary">Photo principale</span>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          className={`mt-1 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center text-sm ${
            dragOver ? 'border-brand-light bg-brand-pale' : 'border-border-default text-ink-tertiary'
          }`}
        >
          {photo ? (
            <p className="font-semibold text-ink-secondary">{photo.name}</p>
          ) : (
            <p>Glissez-déposez une image ici, ou cliquez pour choisir un fichier (JPG, PNG)</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            aria-label="Photo principale"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <div>
        <span className="block text-sm font-semibold text-ink-secondary">Checklists de ménage</span>
        <p className="mt-1 text-xs text-ink-tertiary">
          Un ou plusieurs modèles peuvent être assignés ; leurs items seront tous générés à chaque nouvelle mission.
        </p>
        <div className="mt-2 space-y-1">
          {checklistModeles.length === 0 && <p className="text-sm text-ink-disabled">Aucun modèle pour l'instant.</p>}
          {checklistModeles.map((modele) => (
            <label key={modele.id} className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={checklistModeleIds.includes(modele.id)}
                onChange={() => toggleChecklistModele(modele.id)}
                className="h-4 w-4 rounded border-border-default accent-brand"
              />
              {modele.nom}
            </label>
          ))}
        </div>

        {showNewChecklistInput ? (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newChecklistNom}
              onChange={(e) => setNewChecklistNom(e.target.value)}
              placeholder="Nom du nouveau modèle"
              className="block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreateChecklistModele}
              disabled={creatingChecklist}
              className="shrink-0 rounded-field bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewChecklistInput(true)}
            className="mt-1 text-sm font-semibold text-brand-light hover:text-brand"
          >
            + Créer un nouveau modèle
          </button>
        )}

        {checklistModeles
          .filter((modele) => checklistModeleIds.includes(modele.id))
          .map((modele) => (
            <ChecklistModeleItemsEditor
              key={modele.id}
              checklistModele={modele}
              onAddItem={onAddChecklistModeleItem}
              onDeplacerItem={onDeplacerChecklistModeleItem}
              onDeleteItem={onDeleteChecklistModeleItem}
            />
          ))}
      </div>

      <div>
        <label htmlFor="agent_habituel_id" className="block text-sm font-semibold text-ink-secondary">
          Agent de ménage habituel (optionnel)
        </label>
        <select
          id="agent_habituel_id"
          value={agentHabituelId}
          onChange={(e) => setAgentHabituelId(e.target.value)}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        >
          <option value="">Aucun agent habituel</option>
          {agentsMenage.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.nom}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="proprietaire_id" className="block text-sm font-semibold text-ink-secondary">
          Propriétaire
        </label>
        <select
          id="proprietaire_id"
          value={proprietaireId}
          onChange={(e) => setProprietaireId(e.target.value)}
          className="mt-1 block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
        >
          <option value="">Aucun propriétaire</option>
          {proprietaires.map((proprietaire) => (
            <option key={proprietaire.id} value={proprietaire.id}>
              {proprietaire.nom}
            </option>
          ))}
        </select>

        {showNewProprietaireInput ? (
          <div className="mt-2 space-y-2 rounded-field border border-border-default p-3">
            <input
              type="text"
              value={newProprietaireNom}
              onChange={(e) => setNewProprietaireNom(e.target.value)}
              placeholder="Nom du propriétaire"
              className="block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            <input
              type="tel"
              value={newProprietaireTelephone}
              onChange={(e) => setNewProprietaireTelephone(e.target.value)}
              placeholder="Téléphone (optionnel)"
              className="block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            <input
              type="email"
              value={newProprietaireEmail}
              onChange={(e) => setNewProprietaireEmail(e.target.value)}
              placeholder="Email (optionnel)"
              className="block w-full rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewProprietaireInput(false)}
                className="rounded-field border border-border-default px-3 py-2 text-sm font-semibold text-ink-secondary hover:bg-table-header-bg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateProprietaire}
                disabled={creatingProprietaire}
                className="shrink-0 rounded-field bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
              >
                Créer
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewProprietaireInput(true)}
            className="mt-1 text-sm font-semibold text-brand-light hover:text-brand"
          >
            + Créer un nouveau propriétaire
          </button>
        )}
      </div>

      <div>
        <span className="block text-sm font-semibold text-ink-secondary">Mode de gestion</span>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            aria-pressed={modeGestion === 'mandat'}
            onClick={() => setModeGestion('mandat')}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              modeGestion === 'mandat' ? 'bg-brand text-white' : 'bg-table-header-bg text-ink-secondary hover:bg-border-light'
            }`}
          >
            Mandat
          </button>
          <button
            type="button"
            aria-pressed={modeGestion === 'sous_location'}
            onClick={() => setModeGestion('sous_location')}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              modeGestion === 'sous_location'
                ? 'bg-brand text-white'
                : 'bg-table-header-bg text-ink-secondary hover:bg-border-light'
            }`}
          >
            Sous-location
          </button>
        </div>

        {modeGestion === 'mandat' ? (
          <div className="mt-2">
            <label htmlFor="taux_commission" className="block text-sm font-semibold text-ink-secondary">
              Taux de commission (%)
            </label>
            <input
              id="taux_commission"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={tauxCommission}
              onChange={(e) => setTauxCommission(e.target.value)}
              className="mt-1 block w-32 rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        ) : (
          <div className="mt-2">
            <label htmlFor="loyer_fixe_mensuel" className="block text-sm font-semibold text-ink-secondary">
              Loyer fixe mensuel (MAD)
            </label>
            <input
              id="loyer_fixe_mensuel"
              type="number"
              min="0"
              step="0.01"
              value={loyerFixeMensuel}
              onChange={(e) => setLoyerFixeMensuel(e.target.value)}
              className="mt-1 block w-32 rounded-field border border-border-default px-3 py-2 text-sm text-ink focus:border-brand-light focus:outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        )}
      </div>

      <div>
        <span className="block text-sm font-semibold text-ink-secondary">Statut</span>
        <div className="mt-1">
          <span className="inline-block rounded-badge bg-success-bg px-3 py-1 text-xs font-medium text-success-text">
            {STATUT_LABELS[appartementToEdit?.statut ?? 'disponible'] ?? appartementToEdit?.statut}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-tertiary">
          Ce champ est géré automatiquement et ne peut pas être modifié manuellement.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            resetForm()
            onCancel?.()
          }}
          className="rounded-field border border-border-default px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-table-header-bg"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-field bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          {submitting
            ? 'Enregistrement...'
            : appartementToEdit
              ? 'Enregistrer les modifications'
              : "Enregistrer l'appartement"}
        </button>
      </div>
    </form>
  )
}
