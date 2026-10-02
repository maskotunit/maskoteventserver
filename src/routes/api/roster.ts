import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../../db/index.js'
import { eventPhotos, people, performances, scanEvents, teams, tickets } from '../../../db/schema.js'
import { photoStore } from '@/lib/photoStore'
import { requireAdmin } from '@/lib/adminAuth'

const id = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '_')
const str = (v: unknown) => String(v ?? '').trim()
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Admin roster management: tickets, teams, performances, plus the synced scan feed and deletes for all of them
export const Route = createFileRoute('/api/roster')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const events = await db.select().from(scanEvents).orderBy(desc(scanEvents.scannedAt)).limit(50)
        return Response.json({ events }, { headers: { 'Cache-Control': 'no-store' } })
      },
      POST: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const body = await request.json().catch(() => null)
        try {
          switch (body?.kind) {
            case 'ticket': {
              const ticketHash = id(body.ticketHash) || `TICKET_${crypto.randomUUID().slice(0, 8).toUpperCase()}`
              await db.insert(tickets).values({ ticketHash, holderName: str(body.holderName) })
              return Response.json({ success: true, ticketHash })
            }
            case 'team': {
              const teamName = str(body.teamName)
              if (!teamName) return bad('Team name is required')
              const teamId = id(body.teamId) || `TEAM_${id(teamName)}`
              await db.insert(teams).values({ teamId, teamName })
              return Response.json({ success: true, teamId })
            }
            case 'performance': {
              const userId = id(body.userId)
              const stageName = str(body.stageName)
              const startTime = str(body.startTime)
              const endTime = str(body.endTime)
              if (!userId || !stageName) return bad('Artist and stage are required')
              if (!TIME.test(startTime) || !TIME.test(endTime)) return bad('Times must be HH:MM')
              const [artist] = await db.select().from(people).where(eq(people.userId, userId))
              if (!artist || artist.role !== 'Artist') return bad('That user is not a registered artist')
              const perfId = `PERF_${crypto.randomUUID().slice(0, 6).toUpperCase()}`
              await db.insert(performances).values({ perfId, userId, stageName, startTime, endTime })
              return Response.json({ success: true, perfId })
            }
            default:
              return bad('Unknown roster kind')
          }
        } catch {
          return bad('Could not save — that ID may already exist', 409)
        }
      },
      // Removes one record. Gate devices drop it on their next sync down.
      DELETE: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const body = await request.json().catch(() => null)
        const key = str(body?.id)
        if (body?.kind !== 'all_scans' && !key) return bad('Missing ID')
        switch (body?.kind) {
          case 'ticket':
            await db.delete(tickets).where(eq(tickets.ticketHash, key))
            break
          case 'team':
            // Players on the team stay registered with no team
            await db.delete(teams).where(eq(teams.teamId, key))
            break
          case 'person':
            // Their scheduled performances are removed by cascade
            await db.delete(people).where(eq(people.userId, key))
            break
          case 'performance':
            await db.delete(performances).where(eq(performances.perfId, key))
            break
          case 'scan':
            if (!/^\d+$/.test(key)) return bad('Invalid scan ID')
            await db.delete(scanEvents).where(eq(scanEvents.id, Number(key)))
            break
          case 'all_scans':
            await db.delete(scanEvents)
            break
          case 'photo': {
            // Reactions are removed by cascade
            const [photo] = await db.delete(eventPhotos).where(eq(eventPhotos.photoId, key)).returning()
            if (photo) await photoStore().delete(photo.blobKey)
            break
          }
          default:
            return bad('Unknown roster kind')
        }
        return Response.json({ success: true })
      },
    },
  },
})

function bad(error: string, status = 400) {
  return Response.json({ success: false, error }, { status })
}
