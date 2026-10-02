import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db/index.js'
import { scanEvents, tickets } from '../../../db/schema.js'
import type { SyncUpPayload, SyncUpResult } from '@/lib/types'

// Gate devices upload offline check-ins once they're back on a network
export const Route = createFileRoute('/api/sync-up')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: SyncUpPayload
        try {
          body = await request.json()
        } catch {
          return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const scanned = Array.isArray(body.scannedTickets) ? body.scannedTickets : []
        const events = Array.isArray(body.events) ? body.events : []

        let ticketsMarkedUsed = 0
        const ticketConflicts: string[] = []
        // First device to sync wins; a ticket already used in the cloud is reported as a conflict
        for (const t of scanned) {
          if (typeof t?.ticketHash !== 'string' || typeof t?.scannedAt !== 'string') continue
          const updated = await db
            .update(tickets)
            .set({ status: 'used', scannedAt: t.scannedAt })
            .where(and(eq(tickets.ticketHash, t.ticketHash), eq(tickets.status, 'unused')))
            .returning({ hash: tickets.ticketHash })
          if (updated.length) ticketsMarkedUsed++
          else {
            const [existing] = await db
              .select()
              .from(tickets)
              .where(eq(tickets.ticketHash, t.ticketHash))
            if (existing && existing.scannedAt !== t.scannedAt) ticketConflicts.push(t.ticketHash)
          }
        }

        const validEvents = events
          .filter((e) => e && typeof e.clientId === 'string' && typeof e.kind === 'string')
          .map((e) => ({
            clientId: e.clientId.slice(0, 64),
            deviceId: String(e.deviceId ?? 'unknown').slice(0, 64),
            kind: e.kind.slice(0, 16),
            input: String(e.input ?? '').slice(0, 200),
            outcome: String(e.outcome ?? '').slice(0, 32),
            detail: String(e.detail ?? '').slice(0, 500),
            scannedAt: String(e.scannedAt ?? new Date().toISOString()),
          }))
        let eventsStored = 0
        if (validEvents.length) {
          const inserted = await db
            .insert(scanEvents)
            .values(validEvents)
            .onConflictDoNothing({ target: scanEvents.clientId })
            .returning({ id: scanEvents.id })
          eventsStored = inserted.length
        }

        const result: SyncUpResult = { success: true, ticketsMarkedUsed, ticketConflicts, eventsStored }
        return Response.json(result)
      },
    },
  },
})
