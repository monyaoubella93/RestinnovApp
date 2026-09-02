import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression coverage for the production bug where every paginated list
 * screen (appartements, séjours, utilisateurs, tickets maintenance,
 * produits signalés, historique ménage) threw "Failed to construct 'URL':
 * Invalid URL" and rendered "0 résultats" -- not because of any null photo
 * field, but because VITE_API_BASE_URL is "" in production on purpose (see
 * Dockerfile.prod: relative paths so the build works behind any domain),
 * and `new URL(apiBaseUrl + path)` throws without a base when apiBaseUrl is
 * empty. In every other test file VITE_API_BASE_URL is simply undefined
 * (no .env file loaded), which falls back to an absolute default and never
 * exercises this path -- hence why it went uncaught until production.
 */
describe('api.ts URL construction with an empty VITE_API_BASE_URL (the production default)', () => {
  const paginatedBody = { data: [], current_page: 1, last_page: 1, per_page: 10, total: 0 }

  const endpoints: [name: string, path: string, body: unknown, load: () => Promise<unknown>][] = [
    ['appartements', '/api/appartements', paginatedBody, async () => (await import('./api')).fetchAppartementsListe({})],
    ['sejours', '/api/sejours', paginatedBody, async () => (await import('./api')).fetchSejours({})],
    ['utilisateurs', '/api/utilisateurs', [], async () => (await import('./api')).fetchUtilisateurs({})],
  ]

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(endpoints)('%s: builds a relative request instead of throwing', async (_name, path, body, load) => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => Response.json(body))
    globalThis.fetch = fetchMock as typeof fetch

    await expect(load()).resolves.toEqual(body)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(calledUrl.pathname).toBe(path)
  })
})
