/**
 * The browser version's storage: one IndexedDB database with a few tables.
 * IndexedDB (not localStorage) because it holds big things (imported fixtures)
 * and folder handles, which only IndexedDB can keep between visits.
 */
const DB = 'sound-visualizer'
const TABLES = ['settings', 'myFixtures', 'imported', 'folders', 'media'] as const
export type Table = (typeof TABLES)[number]

let opening: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    // Version 2 added "media" (videos shown on screens).
    const request = indexedDB.open(DB, 2)
    request.onupgradeneeded = () => {
      for (const t of TABLES) if (!request.result.objectStoreNames.contains(t)) request.result.createObjectStore(t)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

function run<T>(table: Table, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const request = work(d.transaction(table, mode).objectStore(table))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      })
  )
}

export const idb = {
  get: <T>(table: Table, key: string) => run<T | undefined>(table, 'readonly', (s) => s.get(key)),
  set: (table: Table, key: string, value: unknown) => run<void>(table, 'readwrite', (s) => s.put(value, key)),
  delete: (table: Table, key: string) => run<void>(table, 'readwrite', (s) => s.delete(key)),
  all: <T>(table: Table) => run<T[]>(table, 'readonly', (s) => s.getAll()),
  keys: (table: Table) => run<string[]>(table, 'readonly', (s) => s.getAllKeys()),
  async clear(tables: readonly Table[] = TABLES): Promise<void> {
    for (const t of tables) await run<void>(t, 'readwrite', (s) => s.clear())
  }
}
