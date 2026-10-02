// Gate operations. Every check runs against the on-device database only — no network.
import { euclidean, MATCH_THRESHOLD } from './face'
import * as local from './localdb'
import type { Performance, Person, ScanEvent, ScanKind, ScanOutcome, SyncPackage, SyncUpResult } from './types'

export type Verdict = {
  tone: 'green' | 'amber' | 'red'
  title: string
  message: string
  person?: Person & { teamName?: string; performances?: Performance[]; distance: number }
}

export async function deviceId(): Promise<string> {
  let id = await local.getMeta<string>('deviceId')
  if (!id) {
    id = `GATE-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    await local.setMeta('deviceId', id)
  }
  return id
}

async function log(kind: ScanKind, input: string, outcome: ScanOutcome, detail: string) {
  const event: local.LocalEvent = {
    clientId: crypto.randomUUID(),
    deviceId: await deviceId(),
    kind,
    input,
    outcome,
    detail,
    scannedAt: new Date().toISOString(),
    synced: false,
  }
  await local.put('events', event)
}

// 1. Ticket scan
export async function scanTicket(raw: string): Promise<Verdict> {
  const hash = raw.trim()
  const ticket = hash ? await local.get('tickets', hash) : undefined
  if (!ticket) {
    await log('ticket', hash, 'fraud', 'Not in master roster')
    return { tone: 'red', title: 'Fraud detected', message: 'This ticket does not exist in the master roster.' }
  }
  if (ticket.status === 'used') {
    await log('ticket', hash, 'duplicate', ticket.scannedAt)
    return {
      tone: 'amber',
      title: 'Duplicate ticket',
      message: `Already checked in at ${formatTime(ticket.scannedAt)}${ticket.holderName ? ` · ${ticket.holderName}` : ''}.`,
    }
  }
  const scannedAt = new Date().toISOString()
  await local.put('tickets', { ...ticket, status: 'used', scannedAt, pendingSync: true })
  await log('ticket', hash, 'granted', ticket.holderName)
  return {
    tone: 'green',
    title: 'Access granted',
    message: ticket.holderName ? `Welcome, ${ticket.holderName}.` : 'Valid ticket checked in.',
  }
}

// 2. Team tag check (text from OCR or typed by staff)
export async function verifyTeamTag(recognised: string): Promise<Verdict> {
  const text = recognised.trim()
  const needle = text.toLowerCase()
  const teams = await local.getAll('teams')
  const match = needle ? teams.find((t) => t.teamName.toLowerCase().includes(needle)) : undefined
  if (match) {
    await log('team', text, 'team_valid', match.teamName)
    return { tone: 'green', title: 'Team validated', message: `Verified team: ${match.teamName} (${match.teamId}).` }
  }
  await log('team', text, 'team_unknown', '')
  return { tone: 'red', title: 'Unrecognised tag', message: `“${text || '—'}” is not in the registration logs.` }
}

// 3. Face identification: nearest registered embedding by Euclidean distance
export async function identifyFace(live: number[]): Promise<Verdict> {
  const users = await local.getAll('users')
  let best: Person | undefined
  let bestDistance = Infinity
  for (const u of users) {
    const d = euclidean(live, u.faceVector)
    if (d < bestDistance) {
      bestDistance = d
      best = u
    }
  }
  if (!best || bestDistance >= MATCH_THRESHOLD) {
    await log('face', 'live capture', 'face_unknown', best ? `nearest ${best.userId} @ ${bestDistance.toFixed(3)}` : '')
    return {
      tone: 'red',
      title: 'No match',
      message: 'This face does not match anyone on the roster. Escalate to a supervisor.',
    }
  }
  const team = best.teamId ? await local.get('teams', best.teamId) : undefined
  const performances =
    best.role === 'Artist'
      ? (await local.getAll('performances'))
          .filter((p) => p.userId === best.userId)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
      : []
  await log('face', 'live capture', 'face_match', `${best.userId} @ ${bestDistance.toFixed(3)}`)
  return {
    tone: 'green',
    title: 'Identity confirmed',
    message: `${best.fullName} · ${best.role}`,
    person: { ...best, teamName: team?.teamName, performances, distance: bestDistance },
  }
}

export type LocalStatus = {
  deviceId: string
  counts: { tickets: number; teams: number; users: number; performances: number }
  pendingTickets: number
  pendingEvents: number
  lastSyncDown?: string
  lastSyncUp?: string
}

export async function localStatus(): Promise<LocalStatus> {
  const [tickets, teams, users, performances, events] = await Promise.all([
    local.getAll('tickets'),
    local.count('teams'),
    local.count('users'),
    local.count('performances'),
    local.getAll('events'),
  ])
  return {
    deviceId: await deviceId(),
    counts: { tickets: tickets.length, teams, users, performances },
    pendingTickets: tickets.filter((t) => t.pendingSync).length,
    pendingEvents: events.filter((e) => !e.synced).length,
    lastSyncDown: await local.getMeta('lastSyncDown'),
    lastSyncUp: await local.getMeta('lastSyncUp'),
  }
}

export async function recentEvents(limit = 25) {
  const events = await local.getAll('events')
  return events.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)).slice(0, limit)
}

// Upload offline scans to the cloud
export async function syncUp(): Promise<SyncUpResult> {
  const tickets = (await local.getAll('tickets')).filter((t) => t.pendingSync)
  const events = (await local.getAll('events')).filter((e) => !e.synced)
  const res = await fetch('/api/sync-up', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scannedTickets: tickets.map((t) => ({ ticketHash: t.ticketHash, scannedAt: t.scannedAt })),
      events: events.map(({ synced: _s, ...e }) => e satisfies ScanEvent),
    }),
  })
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  const result: SyncUpResult = await res.json()
  await local.put('tickets', ...tickets.map((t) => ({ ...t, pendingSync: false })))
  await local.put('events', ...events.map((e) => ({ ...e, synced: true })))
  await local.setMeta('lastSyncUp', new Date().toISOString())
  return result
}

// Download the whole roster for offline use. Pending scans are uploaded first so nothing is lost.
export async function syncDown(): Promise<{ uploadedFirst: boolean; pkg: SyncPackage }> {
  const status = await localStatus()
  const uploadedFirst = status.pendingTickets + status.pendingEvents > 0
  if (uploadedFirst) await syncUp()
  const res = await fetch('/api/sync-down', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const pkg: SyncPackage = await res.json()
  await local.replaceRoster(pkg)
  await local.setMeta('lastSyncDown', pkg.generatedAt)
  return { uploadedFirst, pkg }
}

export function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
