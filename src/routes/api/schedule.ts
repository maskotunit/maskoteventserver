import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../../db/index.js'
import { people, performances } from '../../../db/schema.js'
import type { ScheduleSlot } from '@/lib/types'

// Public performance schedule for the guest page — no face data or IDs beyond the set itself
export const Route = createFileRoute('/api/schedule')({
  server: {
    handlers: {
      GET: async () => {
        const slots: ScheduleSlot[] = await db
          .select({
            perfId: performances.perfId,
            artistName: people.fullName,
            stageName: performances.stageName,
            startTime: performances.startTime,
            endTime: performances.endTime,
          })
          .from(performances)
          .innerJoin(people, eq(people.userId, performances.userId))
          .orderBy(asc(performances.startTime))
        return Response.json({ slots }, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
