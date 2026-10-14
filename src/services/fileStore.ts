/**
 * Conserve le contenu d'une playlist importée depuis un fichier (souvent plusieurs Mo,
 * trop gros pour localStorage) afin de la recharger au prochain lancement.
 */
const DB_NAME = 'moovo-tv'
const STORE = 'files'
const PLAYLIST_KEY = 'local-playlist'

interface StoredPlaylist {
  name: string
  content: string
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = op(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export const fileStore = {
  async savePlaylist(name: string, content: string): Promise<void> {
    try {
      const value: StoredPlaylist = { name, content, savedAt: Date.now() }
      await run('readwrite', (s) => s.put(value, PLAYLIST_KEY))
    } catch (err) {
      console.warn('[Stockage] Playlist locale non mémorisée :', err)
    }
  },

  async loadPlaylist(): Promise<StoredPlaylist | null> {
    try {
      return (await run<StoredPlaylist | undefined>('readonly', (s) => s.get(PLAYLIST_KEY))) ?? null
    } catch {
      return null
    }
  },

  async clear(): Promise<void> {
    try {
      await run('readwrite', (s) => s.delete(PLAYLIST_KEY))
    } catch {
      // Base absente : rien à effacer.
    }
  },
}
