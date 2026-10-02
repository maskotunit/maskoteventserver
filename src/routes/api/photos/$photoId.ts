import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db/index.js'
import { eventPhotos } from '../../../../db/schema.js'
import { photoStore } from '@/lib/photoStore'

// Serves the original image bytes for one event photo
export const Route = createFileRoute('/api/photos/$photoId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [photo] = await db.select().from(eventPhotos).where(eq(eventPhotos.photoId, params.photoId))
        if (!photo) return new Response('Not found', { status: 404 })
        const data = await photoStore().get(photo.blobKey, { type: 'arrayBuffer' })
        if (!data) return new Response('Not found', { status: 404 })
        return new Response(data, {
          headers: { 'Content-Type': photo.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
        })
      },
    },
  },
})
