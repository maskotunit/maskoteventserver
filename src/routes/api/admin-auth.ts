import { createFileRoute } from '@tanstack/react-router'
import { isAdminPasscode } from '@/lib/adminAuth'

// Checks a control room passcode so the admin page can unlock
export const Route = createFileRoute('/api/admin-auth')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null)
        if (!isAdminPasscode(body?.passcode))
          return Response.json({ success: false, error: 'Wrong passcode' }, { status: 401 })
        return Response.json({ success: true })
      },
    },
  },
})
