import { useTranslation } from 'react-i18next'
import { useInstallPrompt } from './useInstallPrompt'

/**
 * "Installer sur le téléphone" card (README §PWA), shown in Mes missions /
 * Mes tickets. Renders nothing once installed or when the browser hasn't
 * offered an install prompt yet (useInstallPrompt.canInstall covers both).
 */
export function InstallPromptCard() {
  const { t } = useTranslation()
  const { canInstall, promptInstall } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-card-agent-lg border-2 border-brand-border bg-brand-pale p-4">
      <img src="/logo.png" alt="" className="h-[34px] w-auto shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-ink">{t('install.title')}</p>
        <p className="text-sm text-ink-tertiary">{t('install.subtitle')}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void promptInstall()
        }}
        className="flex h-12 shrink-0 items-center justify-center rounded-field bg-brand px-4 text-sm font-bold text-white hover:bg-brand-light"
      >
        {t('install.button')}
      </button>
    </div>
  )
}
