const DB_NAME = 'restinnov-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'actions'

export interface QueuedFileField {
  field: string
  blob: Blob
  filename: string
  type: string
}

export interface QueuedAction {
  id?: number
  url: string
  method: string
  /** JSON body (mutually exclusive with `files`/`fields`). */
  json?: unknown
  /** FormData fields, reconstructed into a fresh FormData on replay. */
  fields?: Record<string, string>
  files?: QueuedFileField[]
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.add({ ...action, createdAt: Date.now() })
    request.onsuccess = () => resolve(request.result as number)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as QueuedAction[])
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function countQueuedActions(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function removeAction(id: number): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

function buildRequestInit(action: QueuedAction, authHeaders: HeadersInit): RequestInit {
  if (action.json !== undefined) {
    return {
      method: action.method,
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(action.json),
    }
  }

  const formData = new FormData()
  for (const [key, value] of Object.entries(action.fields ?? {})) {
    formData.append(key, value)
  }
  for (const file of action.files ?? []) {
    formData.append(file.field, new File([file.blob], file.filename, { type: file.type }))
  }

  return { method: action.method, headers: authHeaders, body: formData }
}

/**
 * Replays every queued action against the real network, oldest first, so a
 * checklist toggle sent before its photo doesn't race it on reconnect.
 * Stops at the first failure -- if the connection dropped again mid-flush,
 * later actions stay queued for the next attempt instead of firing
 * out of order into a still-unreachable server.
 */
export async function flushQueue(authHeaders: HeadersInit): Promise<{ succeeded: number; remaining: number }> {
  const actions = await getQueuedActions()
  actions.sort((a, b) => a.createdAt - b.createdAt)

  let succeeded = 0
  for (const action of actions) {
    try {
      const response = await fetch(action.url, buildRequestInit(action, authHeaders))
      if (!response.ok && response.status >= 500) {
        // Server-side trouble, not a rejection of this specific action --
        // worth retrying later rather than dropping it silently.
        break
      }
      if (action.id != null) await removeAction(action.id)
      succeeded += 1
    } catch {
      // Still offline (or the network dropped again mid-flush) -- stop here.
      break
    }
  }

  const remaining = await countQueuedActions()
  return { succeeded, remaining }
}
