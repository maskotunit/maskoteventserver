// Embedded on-device database (IndexedDB) — the browser equivalent of sqflite.
// Everything the gate needs to verify entry lives here so checks work with no network.
import type { Performance, Person, ScanEvent, Team, Ticket } from './types'

export type LocalTicket = Ticket & { pendingSync?: boolean }
export type LocalEvent = ScanEvent & { synced: boolean }

type Stores = {
  tickets: LocalTicket
  teams: Team
  users: Person
  performances: Performance
  events: LocalEvent
}
export type StoreName = keyof Stores

const DB_NAME = 'gatehouse'
const KEYS: Record<StoreName, string> = {
  tickets: 'ticketHash',
  teams: 'teamId',
  users: 'userId',
  performances: 'perfId',
  events: 'clientId',
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const [name, keyPath] of Object.entries(KEYS)) db.createObjectStore(name, { keyPath })
        db.createObjectStore('meta')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function wrap<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll<S extends StoreName>(store: S): Promise<Stores[S][]> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).getAll())
}

export async function get<S extends StoreName>(store: S, key: string): Promise<Stores[S] | undefined> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).get(key))
}

export async function put<S extends StoreName>(store: S, ...rows: Stores[S][]) {
  const db = await open()
  const tx = db.transaction(store, 'readwrite')
  for (const row of rows) tx.objectStore(store).put(row)
  await done(tx)
}

export async function count(store: StoreName) {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).count())
}

// Atomically clear and repopulate the roster stores (like the sqflite batch in the original app)
export async function replaceRoster(data: {
  tickets: LocalTicket[]
  teams: Team[]
  users: Person[]
  performances: Performance[]
}) {
  const db = await open()
  const names = ['tickets', 'teams', 'users', 'performances'] as const
  const tx = db.transaction(names, 'readwrite')
  for (const name of names) {
    const store = tx.objectStore(name)
    store.clear()
    for (const row of data[name]) store.put(row)
  }
  await done(tx)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return wrap(db.transaction('meta').objectStore('meta').get(key))
}

export async function setMeta(key: string, value: unknown) {
  const db = await open()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put(value, key)
  await done(tx)
}
