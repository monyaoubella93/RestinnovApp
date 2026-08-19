import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePwaIdentity } from './usePwaIdentity'

function linkHref(rel: string): string | null {
  return document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)?.href ?? null
}

function metaContent(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null
}

describe('usePwaIdentity', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"], meta[name="theme-color"], meta[name="apple-mobile-web-app-title"]').forEach((el) => el.remove())
  })

  it('points the manifest, theme-color, icon and apple-touch-icon at the manager identity', () => {
    renderHook(() => usePwaIdentity('manager'))

    expect(document.title).toBe('RestInnov')
    expect(linkHref('manifest')).toContain('/manifest.json')
    expect(metaContent('theme-color')).toBe('#4f46e5')
    expect(metaContent('apple-mobile-web-app-title')).toBe('Séjours')
    expect(linkHref('icon')).toContain('/icons/icon-192-manager.png')
    expect(linkHref('apple-touch-icon')).toContain('/icons/icon-192-manager.png')
  })

  it('points the manifest, theme-color, icon and apple-touch-icon at the menage identity', () => {
    renderHook(() => usePwaIdentity('menage'))

    expect(linkHref('manifest')).toContain('/manifest-menage.json')
    expect(metaContent('theme-color')).toBe('#0C1A31')
    expect(linkHref('icon')).toContain('/icons/icon-192-menage.png')
    expect(linkHref('apple-touch-icon')).toContain('/icons/icon-192-menage.png')
  })

  it('points the manifest, theme-color, icon and apple-touch-icon at the maintenance identity', () => {
    renderHook(() => usePwaIdentity('maintenance'))

    expect(linkHref('manifest')).toContain('/manifest-maintenance.json')
    expect(metaContent('theme-color')).toBe('#0C1A31')
    expect(linkHref('icon')).toContain('/icons/icon-192-maintenance.png')
    expect(linkHref('apple-touch-icon')).toContain('/icons/icon-192-maintenance.png')
  })

  it('switches identity when the hook re-renders with a different kind', () => {
    const { rerender } = renderHook(
      ({ kind }: { kind: 'manager' | 'menage' | 'maintenance' }) => usePwaIdentity(kind),
      { initialProps: { kind: 'manager' } },
    )
    expect(linkHref('icon')).toContain('/icons/icon-192-manager.png')

    rerender({ kind: 'maintenance' })
    expect(linkHref('icon')).toContain('/icons/icon-192-maintenance.png')
    expect(metaContent('theme-color')).toBe('#0C1A31')
  })
})
