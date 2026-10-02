import { createFileRoute } from '@tanstack/react-router'
import { db } from '../../../db/index.js'
import { people } from '../../../db/schema.js'
import { requireAdmin } from '@/lib/adminAuth'

const ROLES = ['Player', 'Artist', 'Staff']

// Admin registration: stores a person with the face embedding computed from their photo
export const Route = createFileRoute('/api/register-user')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const body = await request.json().catch(() => null)
        const userId = String(body?.userId ?? '').trim().toUpperCase()
        const fullName = String(body?.fullName ?? '').trim()
        const role = String(body?.role ?? '')
        const teamId = body?.teamId ? String(body.teamId) : null
        const faceVector = body?.faceVector
        const photo = typeof body?.photo === 'string' ? body.photo : null

        if (!userId || !fullName) return bad('User ID and full name are required')
        if (!ROLES.includes(role)) return bad('Role must be Player, Artist or Staff')
        if (
          !Array.isArray(faceVector) ||
          faceVector.length !== 128 ||
          !faceVector.every((n) => typeof n === 'number' && Number.isFinite(n))
        )
          return bad('A 128-dimension face embedding is required — add a photo')
        if (photo && (photo.length > 60_000 || !photo.startsWith('data:image/')))
          return bad('Photo thumbnail is too large or invalid')

        const values = { userId, fullName, role, teamId, faceVector, photo, updatedAt: new Date() }
        try {
          await db
            .insert(people)
            .values(values)
            .onConflictDoUpdate({ target: people.userId, set: values })
        } catch {
          return bad('Could not save — check that the team exists', 500)
        }
        return Response.json({ success: true, message: 'User and face embedding registered successfully!' })
      },
    },
  },
})

function bad(error: string, status = 400) {
  return Response.json({ success: false, error }, { status })
}
