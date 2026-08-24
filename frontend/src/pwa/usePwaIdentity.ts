import { useEffect } from 'react'

interface PwaIdentity {
  title: string
  manifestHref: string
  themeColor: string
  appleTitle: string
  iconHref: string
}

const IDENTITIES: Record<'manager' | 'menage' | 'maintenance', PwaIdentity> = {
  manager: {
    title: 'RestInnov',
    manifestHref: '/manifest.json',
    themeColor: '#4f46e5',
    appleTitle: 'Séjours',
    iconHref: '/icons/icon-192-manager.png',
  },
  menage: {
    title: 'Ménage — Mes missions',
    manifestHref: '/manifest-menage.json',
    themeColor: '#0C1A31',
    appleTitle: 'Ménage',
    iconHref: '/icons/icon-192-menage.png',
  },
  maintenance: {
    title: 'Maintenance — Mes tickets',
    manifestHref: '/manifest-maintenance.json',
    themeColor: '#0C1A31',
    appleTitle: 'Maintenance',
    iconHref: '/icons/icon-192-maintenance.png',
  },
}

function setLinkHref(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.appendChild(link)
  }
  link.href = href
}

function setMetaContent(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = name
    document.head.appendChild(meta)
  }
  meta.content = content
}

/**
 * Points the page's manifest / theme-color / apple-mobile-web-app-title /
 * icon at the Manager, Ménage, or Maintenance identity, so "Add to Home
 * Screen" from "/", "/menage" and "/maintenance" installs three distinct,
 * independent icons (same house pictogram, each space's own background
 * color) rather than all pointing at the same app. iOS Safari ignores the
 * Web Manifest for this entirely and reads apple-mobile-web-app-title/
 * apple-touch-icon instead, so both are kept in sync here.
 */
export function usePwaIdentity(kind: 'manager' | 'menage' | 'maintenance') {
  useEffect(() => {
    const identity = IDENTITIES[kind]

    document.title = identity.title
    setLinkHref('manifest', identity.manifestHref)
    setMetaContent('theme-color', identity.themeColor)
    setMetaContent('apple-mobile-web-app-title', identity.appleTitle)
    setLinkHref('icon', identity.iconHref)
    setLinkHref('apple-touch-icon', identity.iconHref)
  }, [kind])
}
