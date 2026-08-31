import { useRef, useState } from 'react'
import { resolveStorageUrl } from '../api'
import type { ChecklistModele } from '../types'

interface ChecklistModeleItemsEditorProps {
  checklistModele: ChecklistModele
  onAddItem: (checklistModeleId: number, libelle: string, libelleAr?: string | null, photo?: File | null) => Promise<void>
  onDeplacerItem: (itemId: number, direction: 'haut' | 'bas') => Promise<void>
  onDeleteItem: (itemId: number) => Promise<void>
}

export function ChecklistModeleItemsEditor({
  checklistModele,
  onAddItem,
  onDeplacerItem,
  onDeleteItem,
}: ChecklistModeleItemsEditorProps) {
  const [libelle, setLibelle] = useState('')
  const [libelleAr, setLibelleAr] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const items = checklistModele.items ?? []

  const handleAdd = async () => {
    if (!libelle.trim()) return
    setError(null)
    setAdding(true)
    try {
      await onAddItem(checklistModele.id, libelle.trim(), libelleAr.trim() || null, photo)
      setLibelle('')
      setLibelleAr('')
      setPhoto(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mt-2 rounded-field border border-border-default bg-table-header-bg p-3">
      <p className="text-xs font-semibold text-ink-secondary">
        Items de « {checklistModele.nom} » (générés automatiquement sur chaque nouvelle mission)
      </p>

      {items.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-field bg-surface px-2 py-1.5 text-sm border border-border-light"
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.photo_url && (
                  <img
                    src={resolveStorageUrl(item.photo_url)}
                    alt={`Photo de référence pour "${item.libelle}"`}
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                )}
                <span className="truncate text-ink-secondary">
                  {item.libelle}
                  {item.libelle_ar && <span className="font-arabic text-ink-tertiary"> · {item.libelle_ar}</span>}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Monter "${item.libelle}"`}
                  disabled={index === 0}
                  onClick={() => onDeplacerItem(item.id, 'haut')}
                  className="rounded px-1.5 py-0.5 text-ink-tertiary hover:bg-border-light disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Descendre "${item.libelle}"`}
                  disabled={index === items.length - 1}
                  onClick={() => onDeplacerItem(item.id, 'bas')}
                  className="rounded px-1.5 py-0.5 text-ink-tertiary hover:bg-border-light disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Retirer "${item.libelle}"`}
                  onClick={() => onDeleteItem(item.id)}
                  className="rounded px-1.5 py-0.5 text-danger hover:bg-danger-bg"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-disabled">Aucun item pour l'instant.</p>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`nouvel_item_libelle_${checklistModele.id}`}
            className="block text-xs font-semibold text-ink-secondary"
          >
            Nom (français)
          </label>
          <input
            id={`nouvel_item_libelle_${checklistModele.id}`}
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="ex. Passer l'aspirateur"
            className="mt-1 block w-full rounded-field border border-border-default px-3 py-1.5 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`nouvel_item_libelle_ar_${checklistModele.id}`}
            className="block text-xs font-semibold text-ink-secondary"
          >
            Nom (arabe) — optionnel
          </label>
          <input
            id={`nouvel_item_libelle_ar_${checklistModele.id}`}
            type="text"
            dir="rtl"
            value={libelleAr}
            onChange={(e) => setLibelleAr(e.target.value)}
            placeholder="مثال: تنظيف الأرضية"
            className="font-arabic mt-1 block w-full rounded-field border border-border-default px-3 py-1.5 text-sm text-ink focus:border-brand-light focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor={`nouvel_item_photo_${checklistModele.id}`}
            className="block text-xs font-semibold text-ink-secondary"
          >
            Photo de référence (optionnel)
          </label>
          <input
            ref={fileInputRef}
            id={`nouvel_item_photo_${checklistModele.id}`}
            type="file"
            accept="image/jpeg,image/png"
            aria-label={`Photo de référence pour le nouvel item de ${checklistModele.nom}`}
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="shrink-0 rounded-field bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-light disabled:opacity-50"
        >
          + Ajouter
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  )
}
