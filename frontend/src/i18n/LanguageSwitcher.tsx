import { useTranslation } from 'react-i18next'
import { setAppLanguage, type AppLanguage } from './index'

/**
 * FR / عربي toggle for the ménage and maintenance agent spaces. Persists the
 * choice to localStorage (via setAppLanguage) so it's remembered on the
 * agent's next login -- no per-space state, one language for both.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.language as AppLanguage
  const other: AppLanguage = current === 'ar' ? 'fr' : 'ar'

  return (
    <button
      type="button"
      onClick={() => setAppLanguage(other)}
      aria-label={t('language.toggleLabel')}
      className="flex min-h-12 items-center justify-center gap-1.5 rounded-[10px] px-3 py-2.5 text-sm font-bold text-rail-text hover:bg-white/5"
    >
      <span className={current === 'fr' ? 'text-white' : 'text-rail-meta'}>FR</span>
      <span aria-hidden="true" className="text-rail-meta">
        /
      </span>
      <span className={`font-arabic ${current === 'ar' ? 'text-white' : 'text-rail-meta'}`}>عربي</span>
    </button>
  )
}
