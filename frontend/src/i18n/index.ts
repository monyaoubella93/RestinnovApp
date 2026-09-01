import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import fr from './locales/fr.json'

export const LANGUAGE_STORAGE_KEY = 'app_language'
export type AppLanguage = 'fr' | 'ar'

function readStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return stored === 'ar' ? 'ar' : 'fr'
}

void i18next.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: readStoredLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
})

export function setAppLanguage(language: AppLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  void i18next.changeLanguage(language)
}

export default i18next
