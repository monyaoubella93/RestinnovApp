import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './auth/AuthContext'
import { fetchMesTicketsMaintenance } from './api'
import { HistoriqueTicketsAgentSection } from './components/HistoriqueTicketsAgentSection'
import { MesTicketsSection } from './components/MesTicketsSection'
import { useMediaQuery } from './hooks/useMediaQuery'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'
import { SyncStatusPill } from './pwa/SyncStatusPill'
import { useOfflineSync } from './pwa/useOfflineSync'
import { usePwaIdentity } from './pwa/usePwaIdentity'
import type { MonTicketMaintenance } from './types'

const MOBILE_QUERY = '(max-width: 767px)'

type Onglet = 'mes-tickets' | 'en-attente' | 'refuses' | 'valides'

const ONGLET_ICONS: Record<Onglet, string> = {
  'mes-tickets': '🔧',
  'en-attente': '⏳',
  refuses: '⚠️',
  valides: '🗂️',
}

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function MaintenanceWorkspace() {
  usePwaIdentity('maintenance')
  const offlineSync = useOfflineSync()
  const { t, i18n } = useTranslation()
  const isRtl = i18n.language === 'ar'
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const { user, logout } = useAuth()
  const [onglet, setOnglet] = useState<Onglet>('mes-tickets')
  const [tickets, setTickets] = useState<MonTicketMaintenance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ONGLETS: { id: Onglet; label: string; icon: string }[] = [
    { id: 'mes-tickets', label: t('maintenance.nav.mesTickets'), icon: ONGLET_ICONS['mes-tickets'] },
    { id: 'en-attente', label: t('maintenance.nav.enAttente'), icon: ONGLET_ICONS['en-attente'] },
    { id: 'refuses', label: t('maintenance.nav.refuses'), icon: ONGLET_ICONS.refuses },
    { id: 'valides', label: t('maintenance.nav.valides'), icon: ONGLET_ICONS.valides },
  ]

  const chargerTickets = () => {
    setLoading(true)
    setError(null)
    fetchMesTicketsMaintenance()
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : t('maintenance.errorTickets')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    chargerTickets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const actifs = tickets.filter((t) => t.statut === 'assigne')
  const enAttente = tickets.filter((t) => t.statut === 'resolu_en_attente_validation')
  const refuses = tickets.filter((t) => t.statut === 'a_refaire')
  const refusesNonVus = refuses.some((t) => t.refus.some((r) => !r.vu))

  const counts: Partial<Record<Onglet, number>> = {
    'mes-tickets': actifs.length,
    'en-attente': enAttente.length,
    refuses: refuses.length,
  }

  const today = new Date().toLocaleDateString(isRtl ? 'ar-MA' : 'fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1)

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`flex min-h-screen bg-app-bg text-ink ${isMobile ? 'flex-col' : ''} ${isRtl ? 'font-arabic' : 'font-sans'}`}
    >
      {isMobile ? (
        // Mobile top bar: logo/title + logout only, guaranteed to fit down
        // to a 360px-wide phone -- the rest of the sidebar's content (tabs,
        // language, user info) moves to the bottom nav / a second row below.
        <>
          <header className="flex shrink-0 items-center gap-2 border-b border-border-default bg-surface px-3 py-2.5">
            <img src="/logo.png" alt={t('common.brand')} className="h-7 w-auto shrink-0 object-contain" />
            <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-[-0.02em] text-ink">
              {t('maintenance.title')}
            </h1>
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              aria-label={t('common.logout')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-ink-tertiary hover:bg-table-header-bg"
            >
              🚪
            </button>
          </header>
          <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-surface px-3 py-2">
            <SyncStatusPill {...offlineSync} />
            <LanguageSwitcher />
          </div>
        </>
      ) : (
        <nav
          className="flex w-[246px] shrink-0 flex-col bg-marine px-3.5 py-5"
          role="tablist"
          aria-label={t('maintenance.workspaceNavLabel')}
        >
          <div className="flex items-center px-1 pb-5">
            <img src="/logo.png" alt={t('common.brand')} className="h-[38px] w-auto object-contain" />
          </div>

          <div className="flex flex-col gap-1">
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={onglet === o.id}
                onClick={() => setOnglet(o.id)}
                className={`relative flex items-center gap-2.5 rounded-[10px] px-3 py-3 text-start text-[15px] font-semibold ${
                  onglet === o.id ? 'bg-brand text-white' : 'text-rail-text hover:bg-white/5'
                }`}
              >
                <span aria-hidden="true" className="text-lg">
                  {o.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {counts[o.id] !== undefined && (
                  <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-white/15 px-1.5 font-mono text-xs font-bold text-white">
                    {counts[o.id]}
                  </span>
                )}
                {o.id === 'refuses' && refusesNonVus && (
                  <span
                    data-testid="refuses-dot"
                    role="status"
                    aria-label={t('maintenance.nouveauRefus')}
                    className="absolute end-2 top-2 h-2.5 w-2.5 rounded-full bg-danger"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3">
            {user && (
              <div className="flex items-center gap-2.5 border-t border-marine-border px-1 pt-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {initiales(user.nom)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#E6EBF4]">{user.nom}</div>
                  <div className="text-[11px] text-rail-meta">{t('maintenance.agentTitle')}</div>
                </div>
              </div>
            )}
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              aria-label={t('common.logout')}
              className="flex min-h-12 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-start text-sm font-semibold text-rail-text hover:bg-white/5"
            >
              <span aria-hidden="true" className="text-lg">
                🚪
              </span>
              {t('common.logout')}
            </button>
          </div>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {!isMobile && (
          <header className="flex h-[68px] shrink-0 items-center gap-4 border-b border-border-default bg-surface px-6">
            <div>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">{t('maintenance.title')}</h1>
            </div>
            <div className="border-s border-border-default ps-4 text-[13px] text-ink-tertiary">
              {todayCapitalized}
            </div>
            <SyncStatusPill {...offlineSync} />
          </header>
        )}

        <main className={`flex-1 overflow-auto p-4 md:p-6 ${isMobile ? 'pb-20' : ''}`}>
          {onglet === 'mes-tickets' && (
            <MesTicketsSection
              tickets={actifs}
              loading={loading}
              error={error}
              heading={t('maintenance.heading')}
              emptyIcon="✅"
              emptyMessage={t('maintenance.emptyMesTickets')}
              onRefresh={chargerTickets}
            />
          )}
          {onglet === 'en-attente' && (
            <MesTicketsSection
              tickets={enAttente}
              loading={loading}
              error={error}
              emptyIcon="⏳"
              emptyMessage={t('maintenance.emptyEnAttente')}
              onRefresh={chargerTickets}
            />
          )}
          {onglet === 'refuses' && (
            <MesTicketsSection
              tickets={refuses}
              loading={loading}
              error={error}
              emptyIcon="🎉"
              emptyMessage={t('maintenance.emptyRefuses')}
              onRefresh={chargerTickets}
            />
          )}
          {onglet === 'valides' && <HistoriqueTicketsAgentSection />}
        </main>
      </div>

      {isMobile && (
        <nav
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border-default bg-marine"
          role="tablist"
          aria-label={t('maintenance.workspaceNavLabel')}
        >
          {ONGLETS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={onglet === o.id}
              onClick={() => setOnglet(o.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                onglet === o.id ? 'text-white' : 'text-rail-text'
              }`}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                {o.icon}
              </span>
              <span className="max-w-full truncate px-1">{o.label}</span>
              {counts[o.id] !== undefined && counts[o.id]! > 0 && (
                <span className="absolute end-2.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 font-mono text-[10px] font-bold text-white">
                  {counts[o.id]}
                </span>
              )}
              {o.id === 'refuses' && refusesNonVus && (
                <span
                  data-testid="refuses-dot-mobile"
                  role="status"
                  aria-label={t('maintenance.nouveauRefus')}
                  className="absolute end-3 top-0.5 h-2 w-2 rounded-full bg-danger"
                />
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
