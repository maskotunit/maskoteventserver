import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../../db/index.js'
import { people, performances, teams, tickets } from '../../../db/schema.js'
import type { SyncPackage } from '@/lib/types'

// Gate devices download the full roster while online, then work fully offline
export const Route = createFileRoute('/api/sync-down')({
  server: {
    handlers: {
      GET: async () => {
        const [t, tm, u, p] = await Promise.all([
          db.select().from(tickets),
          db.select().from(teams),
          db.select().from(people),
          db.select().from(performances),
        ])
        const pkg: SyncPackage = {
          generatedAt: new Date().toISOString(),
          tickets: t as SyncPackage['tickets'],
          teams: tm,
          users: u.map(({ updatedAt: _u, ...rest }) => rest) as SyncPackage['users'],
          performances: p,
        }
        return Response.json(pkg, { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
