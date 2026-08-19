import '@testing-library/jest-dom/vitest'
// jsdom has no IndexedDB implementation; the app relies on it for the
// offline queue (src/pwa/offlineQueue.ts), so every test gets a real,
// working (in-memory) IndexedDB the same way production does.
import 'fake-indexeddb/auto'
