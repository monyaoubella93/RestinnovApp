import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
// jsdom has no IndexedDB implementation; the app relies on it for the
// offline queue (src/pwa/offlineQueue.ts), so every test gets a real,
// working (in-memory) IndexedDB the same way production does.
import 'fake-indexeddb/auto'
// Components under src/pwa and the ménage/maintenance trees call
// useTranslation() -- initialize i18next once for every test the same way
// main.tsx does for the real app, defaulting to French (no stored language).
import './i18n'

const store = new Map<string, string>()

const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key)
  }),
  clear: vi.fn(() => {
    store.clear()
  }),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})
