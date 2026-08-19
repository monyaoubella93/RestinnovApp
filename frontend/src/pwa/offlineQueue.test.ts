import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countQueuedActions, enqueueAction, flushQueue, getQueuedActions } from './offlineQueue'

describe('offlineQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Fresh, empty database per test -- flushQueue/enqueueAction share a
    // module-level DB name, so without this tests would see each other's
    // queued actions.
    globalThis.indexedDB = new IDBFactory()
  })

  it('stores a queued action and reports it in the count/list', async () => {
    await enqueueAction({
      url: 'https://api.test/api/checklist-items/1',
      method: 'POST',
      fields: { _method: 'PATCH', coche: 'true' },
    })

    expect(await countQueuedActions()).toBe(1)
    const [action] = await getQueuedActions()
    expect(action.url).toBe('https://api.test/api/checklist-items/1')
    expect(action.fields).toEqual({ _method: 'PATCH', coche: 'true' })
  })

  it('stores a queued action with a file field', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    await enqueueAction({
      url: 'https://api.test/api/mission-menages/1/photos-preuve',
      method: 'POST',
      files: [{ field: 'photos[]', blob, filename: 'preuve.jpg', type: 'image/jpeg' }],
    })

    const [action] = await getQueuedActions()
    expect(action.files).toHaveLength(1)
    expect(action.files![0].filename).toBe('preuve.jpg')
  })

  it('flushQueue replays actions in creation order and removes them on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch

    await enqueueAction({ url: 'https://api.test/first', method: 'PATCH', json: { a: 1 } })
    await enqueueAction({ url: 'https://api.test/second', method: 'PATCH', json: { a: 2 } })

    const result = await flushQueue({ Authorization: 'Bearer token' })

    expect(result).toEqual({ succeeded: 2, remaining: 0 })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.test/first', expect.objectContaining({ method: 'PATCH' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.test/second', expect.objectContaining({ method: 'PATCH' }))
    expect(await countQueuedActions()).toBe(0)
  })

  it('flushQueue stops at the first still-offline failure and keeps the rest queued', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    globalThis.fetch = fetchMock as typeof fetch

    await enqueueAction({ url: 'https://api.test/first', method: 'PATCH', json: { a: 1 } })
    await enqueueAction({ url: 'https://api.test/second', method: 'PATCH', json: { a: 2 } })

    const result = await flushQueue({})

    expect(result).toEqual({ succeeded: 0, remaining: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('flushQueue rebuilds a FormData body from stored fields and files on replay', async () => {
    let capturedBody: FormData | null = null
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData
      return new Response('{}', { status: 200 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    await enqueueAction({
      url: 'https://api.test/api/checklist-items/1',
      method: 'POST',
      fields: { _method: 'PATCH' },
      files: [{ field: 'photo', blob, filename: 'preuve.jpg', type: 'image/jpeg' }],
    })

    await flushQueue({})

    expect(capturedBody).toBeInstanceOf(FormData)
    expect(capturedBody!.get('_method')).toBe('PATCH')
    const file = capturedBody!.get('photo') as File
    expect(file.name).toBe('preuve.jpg')
  })
})
