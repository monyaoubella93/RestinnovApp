import { useEffect, useRef, useState } from 'react'
import { fetchAppartementsListe, fetchSejours } from '../api'
import type { Appartement, Sejour } from '../types'

const DEBOUNCE_MS = 300
const RESULTS_PER_TYPE = 5

interface HeaderSearchBarProps {
  onNavigateToSejour: (sejourId: number) => void
  onNavigateToAppartement: (appartement: Appartement) => void
}

function SejourIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M3.5 9h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
    </svg>
  )
}

function AppartementIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6" />
    </svg>
  )
}

export function HeaderSearchBar({ onNavigateToSejour, onNavigateToAppartement }: HeaderSearchBarProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<{ sejours: Sejour[]; appartements: Appartement[] } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setOpen(false)
      return
    }

    let cancelled = false
    const timeout = setTimeout(() => {
      Promise.all([
        fetchSejours({ search: trimmed, per_page: RESULTS_PER_TYPE }),
        fetchAppartementsListe({ search: trimmed, per_page: RESULTS_PER_TYPE }),
      ])
        .then(([sejoursRes, appartementsRes]) => {
          if (cancelled) return
          setResults({ sejours: sejoursRes.data, appartements: appartementsRes.data })
          setOpen(true)
        })
        .catch(() => {
          if (!cancelled) setResults({ sejours: [], appartements: [] })
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelectSejour = (sejour: Sejour) => {
    setOpen(false)
    setQuery('')
    onNavigateToSejour(sejour.id)
  }

  const handleSelectAppartement = (appartement: Appartement) => {
    setOpen(false)
    setQuery('')
    onNavigateToAppartement(appartement)
  }

  const hasResults = results != null && (results.sejours.length > 0 || results.appartements.length > 0)

  return (
    <div ref={containerRef} className="relative">
      <label className="flex h-9 w-[260px] items-center gap-2 rounded-field border border-border-default bg-table-header-bg px-3 text-[13px] text-ink-disabled focus-within:text-ink">
        <span aria-hidden="true">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (results) setOpen(true)
          }}
          placeholder="Rechercher un séjour, un appartement…"
          aria-label="Rechercher un séjour, un appartement"
          className="w-full bg-transparent text-ink placeholder:text-ink-disabled focus:outline-none"
        />
      </label>

      {open && results && (
        <div
          data-testid="header-search-results"
          className="absolute left-0 right-0 z-10 mt-2 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {!hasResults ? (
            <p className="p-4 text-sm text-gray-500">Aucun résultat trouvé</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.sejours.length > 0 && (
                <div className="p-2">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Séjours</h3>
                  <ul>
                    {results.sejours.map((sejour) => (
                      <li key={`sejour-${sejour.id}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectSejour(sejour)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                        >
                          <SejourIcon />
                          <span>
                            {sejour.reference} — {sejour.nom_voyageur}
                            {sejour.appartement ? ` (${sejour.appartement.nom})` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results.appartements.length > 0 && (
                <div className="p-2">
                  <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Appartements</h3>
                  <ul>
                    {results.appartements.map((appartement) => (
                      <li key={`appartement-${appartement.id}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectAppartement(appartement)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                        >
                          <AppartementIcon />
                          <span>
                            {appartement.nom} — {appartement.adresse}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
