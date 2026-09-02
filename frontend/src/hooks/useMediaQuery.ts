import { useEffect, useState } from 'react'

/**
 * Reactive `window.matchMedia` query -- updates on viewport/orientation
 * changes (e.g. rotating a phone, or resizing a desktop window past a
 * breakpoint), unlike a one-off `matchMedia(query).matches` check.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [query])

  return matches
}
