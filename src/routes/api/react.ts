import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../db/index.js'
import { eventPhotos, photoReactions } from '../../../db/schema.js'

// Anonymous guest reactions: each browser sends its own random visitor ID, no sign-in needed
export const Route = createFileRoute('/api/react')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        const photoId = String(body?.photoId ?? '')
        const visitorId = String(body?.visitorId ?? '')
        const liked = Boolean(body?.liked)
        const stars = body?.stars == null ? null : Number(body.stars)
        if (!photoId || !/^[\w-]{8,64}$/.test(visitorId)) return bad('Missing photo or visitor')
        if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5))
          return bad('Stars must be 1 to 5')

        const [photo] = await db.select().from(eventPhotos).where(eq(eventPhotos.photoId, photoId))
        if (!photo) return bad('That photo was removed', 404)

        const values = { photoId, visitorId, liked, stars, updatedAt: new Date() }
        await db
          .insert(photoReactions)
          .values(values)
          .onConflictDoUpdate({ target: [photoReactions.photoId, photoReactions.visitorId], set: values })
        return Response.json({ success: true })
      },
    },
  },
})

function bad(error: string, status = 400) {
  return Response.json({ success: false, error }, { status })
}
