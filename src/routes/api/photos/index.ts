import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../../../../db/index.js'
import { eventPhotos, photoReactions } from '../../../../db/schema.js'
import { photoStore } from '@/lib/photoStore'
import { requireAdmin } from '@/lib/adminAuth'
import type { GuestPhoto } from '@/lib/types'

const MAX_BYTES = 4_000_000
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Public photo wall (with per-guest reaction state) and admin photo upload
export const Route = createFileRoute('/api/photos/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const visitorId = new URL(request.url).searchParams.get('visitor') ?? ''
        const rows = await db
          .select({
            photoId: eventPhotos.photoId,
            caption: eventPhotos.caption,
            createdAt: eventPhotos.createdAt,
            likes: sql<number>`count(*) filter (where ${photoReactions.liked})::int`,
            ratingCount: sql<number>`count(${photoReactions.stars})::int`,
            ratingAvg: sql<number | null>`round(avg(${photoReactions.stars}), 1)::float`,
          })
          .from(eventPhotos)
          .leftJoin(photoReactions, eq(photoReactions.photoId, eventPhotos.photoId))
          .groupBy(eventPhotos.photoId)
          .orderBy(desc(eventPhotos.createdAt))

        const mine = visitorId
          ? await db
              .select({ photoId: photoReactions.photoId, liked: photoReactions.liked, stars: photoReactions.stars })
              .from(photoReactions)
              .where(eq(photoReactions.visitorId, visitorId))
          : []
        const mineById = new Map(mine.map((m) => [m.photoId, m]))

        const photos: GuestPhoto[] = rows.map((r) => ({
          ...r,
          url: `/api/photos/${r.photoId}`,
          createdAt: r.createdAt.toISOString(),
          mine: { liked: mineById.get(r.photoId)?.liked ?? false, stars: mineById.get(r.photoId)?.stars ?? null },
        }))
        return Response.json({ photos }, { headers: { 'Cache-Control': 'no-store' } })
      },
      POST: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const form = await request.formData().catch(() => null)
        const file = form?.get('file')
        const caption = String(form?.get('caption') ?? '').trim().slice(0, 200)
        if (!(file instanceof File)) return bad('Choose a photo to upload')
        if (!TYPES.includes(file.type)) return bad('Photos must be JPEG, PNG or WebP')
        if (file.size > MAX_BYTES) return bad('Photo is too large (max 4 MB)')

        const photoId = `PHOTO_${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        const blobKey = photoId
        await photoStore().set(blobKey, await file.arrayBuffer())
        try {
          await db.insert(eventPhotos).values({ photoId, caption, blobKey, contentType: file.type })
        } catch {
          await photoStore().delete(blobKey)
          return bad('Could not save the photo', 500)
        }
        return Response.json({ success: true, photoId })
      },
    },
  },
})

function bad(error: string, status = 400) {
  return Response.json({ success: false, error }, { status })
}
