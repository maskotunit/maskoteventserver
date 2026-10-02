// Control room passcode. Set CONTROL_ROOM_PASSCODE in the Netlify UI to override the default.
export const ADMIN_HEADER = 'x-control-passcode'

function passcode() {
  return process.env.CONTROL_ROOM_PASSCODE || 'MCHINA22440015'
}

export function isAdminPasscode(value: unknown) {
  const a = String(value ?? '').trim().toUpperCase()
  const b = passcode().toUpperCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Returns a 401 response when the request lacks the control room passcode, otherwise null
export function requireAdmin(request: Request) {
  if (isAdminPasscode(request.headers.get(ADMIN_HEADER))) return null
  return Response.json({ success: false, error: 'Control room passcode required' }, { status: 401 })
}
