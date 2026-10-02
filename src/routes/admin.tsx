import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, Flag, Heart, ImagePlus, Lock, LogOut, RefreshCw, Star, Ticket, Trash2, Upload, UserPlus } from 'lucide-react'
import { CameraPanel } from '@/components/CameraPanel'
import { fromSource, processPhotoFile } from '@/lib/face'
import { formatTime } from '@/lib/gate'
import type { DeleteKind, GuestPhoto, Role, SyncPackage } from '@/lib/types'

export const Route = createFileRoute('/admin')({
  head: () => ({ meta: [{ title: 'Control room · Gatehouse' }] }),
  component: ControlRoom,
})

type CloudEvent = {
  id: number
  deviceId: string
  kind: string
  input: string
  outcome: string
  detail: string
  scannedAt: string
}

const PASSCODE_KEY = 'gatehouse-control-passcode'

// Every admin API call carries the passcode the operator unlocked the control room with
function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('x-control-passcode', sessionStorage.getItem(PASSCODE_KEY) ?? '')
  return fetch(url, { ...init, headers })
}

async function post(url: string, body: unknown) {
  const res = await adminFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

async function remove(kind: DeleteKind, id: string | number, what: string) {
  if (!window.confirm(`Delete ${what}? This can't be undone.`)) return false
  const res = await adminFetch('/api/roster', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id: String(id) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error ?? `Delete failed (${res.status})`)
  return true
}

// Downscale to a web-friendly JPEG before upload so originals stay well under function limits
async function shrinkPhoto(file: File, max = 2000): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image'))), 'image/jpeg', 0.85),
  )
}

function ControlRoom() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    setUnlocked(!!sessionStorage.getItem(PASSCODE_KEY))
  }, [])

  if (unlocked === null) return null
  if (!unlocked) return <Unlock onUnlock={() => setUnlocked(true)} />
  return (
    <ControlRoomPanel
      onLock={() => {
        sessionStorage.removeItem(PASSCODE_KEY)
        setUnlocked(false)
      }}
    />
  )
}

function Unlock({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setError('')
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      })
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong passcode' : `Check failed (${res.status})`)
      sessionStorage.setItem(PASSCODE_KEY, code.trim())
      onUnlock()
    } catch (err) {
      setError(navigator.onLine ? (err as Error).message : 'The control room needs a connection.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <form className="card mx-auto mt-10 max-w-sm p-6" onSubmit={submit}>
      <Lock className="h-8 w-8 text-volt" />
      <h1 className="mt-3 text-2xl font-black tracking-tight">Control room</h1>
      <p className="mt-1 text-sm text-mute">Enter the passcode to manage the roster, schedule and photos.</p>
      <label className="label mt-5 block" htmlFor="passcode">
        Passcode
      </label>
      <input
        id="passcode"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="field mt-1 w-full"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <p className="mt-3 text-sm text-stop">{error}</p>}
      <button className="btn-primary mt-5 w-full" disabled={checking || !code.trim()}>
        {checking ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  )
}

function ControlRoomPanel({ onLock }: { onLock: () => void }) {
  const [roster, setRoster] = useState<SyncPackage | null>(null)
  const [events, setEvents] = useState<CloudEvent[]>([])
  const [photos, setPhotos] = useState<GuestPhoto[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'people' | 'tickets' | 'teams' | 'sets' | 'photos'>('people')

  const load = useCallback(async () => {
    setError('')
    try {
      const [r, e, p] = await Promise.all([
        fetch('/api/sync-down', { cache: 'no-store' }).then((r) => r.json()),
        adminFetch('/api/roster', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/photos', { cache: 'no-store' }).then((r) => r.json()),
      ])
      setRoster(r)
      setEvents(e.events ?? [])
      setPhotos(p.photos ?? [])
      if (e.success === false) onLock()
    } catch {
      setError('The control room needs a connection to the cloud roster.')
    }
  }, [onLock])

  useEffect(() => {
    load()
  }, [load])

  const del = (kind: DeleteKind, id: string | number, what: string) => async () => {
    setError('')
    try {
      if (await remove(kind, id, what)) await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const used = roster?.tickets.filter((t) => t.status === 'used').length ?? 0
  const teamName = (id: string | null) => roster?.teams.find((t) => t.teamId === id)?.teamName

  return (
    <>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-volt">Cloud roster · pre-event setup</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Control room</h1>
          <p className="mt-1 max-w-xl text-sm text-mute">
            Register people, issue tickets and post event photos while online. Gate devices pick up changes on their next sync down.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button className="btn-ghost" onClick={onLock}>
            <LogOut className="h-4 w-4" /> Lock
          </button>
        </div>
      </section>

      {error && <p className="mb-6 rounded-lg bg-stop/10 px-4 py-3 text-sm text-stop">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Checked in', roster ? `${used}/${roster.tickets.length}` : '–'],
          ['People', roster?.users.length ?? '–'],
          ['Teams', roster?.teams.length ?? '–'],
          ['Synced scans', events.length],
        ].map(([k, v]) => (
          <div key={k} className="card px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-mute">{k}</div>
            <div className="mt-1 font-mono text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <RegisterPerson teams={roster?.teams ?? []} onDone={load} />

          <div className="card">
            <div className="flex flex-wrap gap-1 border-b border-line p-2">
              {(
                [
                  ['people', 'People'],
                  ['tickets', 'Tickets'],
                  ['teams', 'Teams'],
                  ['sets', 'Performances'],
                  ['photos', 'Photos'],
                ] as const
              ).map(([id, l]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === id ? 'bg-raised text-chalk' : 'text-mute hover:text-chalk'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="max-h-[440px] overflow-y-auto p-2">
              {tab === 'people' &&
                roster?.users.map((u) => (
                  <Row key={u.userId} onDelete={del('person', u.userId, `${u.fullName} and their scheduled sets`)}>
                    {u.photo ? (
                      <img src={u.photo} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised text-xs font-bold">
                        {u.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{u.fullName}</div>
                      <div className="font-mono text-[11px] text-mute">{u.userId}</div>
                    </div>
                    <span className="text-xs text-mute">{teamName(u.teamId) ?? ''}</span>
                    <RoleBadge role={u.role} />
                  </Row>
                ))}
              {tab === 'tickets' &&
                roster?.tickets.map((t) => (
                  <Row key={t.ticketHash} onDelete={del('ticket', t.ticketHash, `ticket ${t.ticketHash}`)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm">{t.ticketHash}</div>
                      <div className="text-xs text-mute">{t.holderName || 'Unnamed holder'}</div>
                    </div>
                    {t.status === 'used' ? (
                      <span className="text-xs text-hold">Used · {formatTime(t.scannedAt)}</span>
                    ) : (
                      <span className="text-xs text-go">Unused</span>
                    )}
                  </Row>
                ))}
              {tab === 'teams' &&
                roster?.teams.map((t) => (
                  <Row key={t.teamId} onDelete={del('team', t.teamId, `team ${t.teamName}`)}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t.teamName}</div>
                      <div className="font-mono text-[11px] text-mute">{t.teamId}</div>
                    </div>
                    <span className="text-xs text-mute">
                      {roster.users.filter((u) => u.teamId === t.teamId).length} players
                    </span>
                  </Row>
                ))}
              {tab === 'photos' &&
                (photos.length === 0 ? (
                  <p className="p-3 text-sm text-mute">No event photos yet. Post one from the panel on the right.</p>
                ) : (
                  photos.map((p) => (
                    <Row key={p.photoId} onDelete={del('photo', p.photoId, 'this photo and its reactions')}>
                      <img src={p.url} alt="" className="h-12 w-16 rounded-lg object-cover" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.caption || 'Untitled'}</div>
                        <div className="font-mono text-[11px] text-mute">{formatTime(p.createdAt)}</div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-stop">
                        <Heart className="h-3.5 w-3.5 fill-current" /> {p.likes}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-hold">
                        <Star className="h-3.5 w-3.5 fill-current" /> {p.ratingAvg ?? '–'}
                        <span className="text-mute">({p.ratingCount})</span>
                      </span>
                    </Row>
                  ))
                ))}
              {tab === 'sets' &&
                roster?.performances
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((p) => (
                    <Row key={p.perfId} onDelete={del('performance', p.perfId, `the ${p.startTime} set on ${p.stageName}`)}>
                      <div className="font-mono text-sm text-volt">
                        {p.startTime}–{p.endTime}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{roster.users.find((u) => u.userId === p.userId)?.fullName ?? p.userId}</div>
                        <div className="text-xs text-mute">{p.stageName}</div>
                      </div>
                    </Row>
                  ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <PostPhoto onDone={load} />
          <QuickForm
            icon={<Ticket className="h-4 w-4" />}
            title="Issue ticket"
            fields={[
              { name: 'holderName', label: 'Holder name', placeholder: 'Jordan Lee' },
              { name: 'ticketHash', label: 'Ticket code (optional)', placeholder: 'Auto-generated', mono: true },
            ]}
            submit={(v) => post('/api/roster', { kind: 'ticket', ...v }).then((r) => `Issued ${r.ticketHash}`)}
            onDone={load}
          />
          <QuickForm
            icon={<Flag className="h-4 w-4" />}
            title="Add team"
            fields={[{ name: 'teamName', label: 'Team name', placeholder: 'Silver Sharks', required: true }]}
            submit={(v) => post('/api/roster', { kind: 'team', ...v }).then((r) => `Added ${r.teamId}`)}
            onDone={load}
          />
          <QuickForm
            icon={<CalendarClock className="h-4 w-4" />}
            title="Schedule a set"
            fields={[
              {
                name: 'userId',
                label: 'Artist',
                required: true,
                options: roster?.users.filter((u) => u.role === 'Artist').map((u) => [u.userId, u.fullName]) ?? [],
              },
              { name: 'stageName', label: 'Stage', placeholder: 'Main Stage', required: true },
              { name: 'startTime', label: 'Start', type: 'time', required: true, half: true },
              { name: 'endTime', label: 'End', type: 'time', required: true, half: true },
            ]}
            submit={(v) => post('/api/roster', { kind: 'performance', ...v }).then(() => 'Set scheduled')}
            onDone={load}
          />

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest">Synced gate scans</h2>
              {events.length > 0 && (
                <button className="text-xs text-mute hover:text-stop" onClick={del('all_scans', '', 'every synced scan')}>
                  Clear all
                </button>
              )}
            </div>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-mute">Nothing uploaded yet. Gate devices send scans on sync up.</p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.id} className="group rounded-lg bg-raised px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold capitalize">
                        {e.kind} · {e.outcome.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-mute">{formatTime(e.scannedAt)}</span>
                      <DeleteButton onClick={del('scan', e.id, 'this scan record')} />
                    </div>
                    <div className="truncate font-mono text-mute">
                      {e.deviceId} · {e.input} {e.detail && `· ${e.detail}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  )
}

function Row({ children, onDelete }: { children: ReactNode; onDelete?: () => void }) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-raised">
      {children}
      {onDelete && <DeleteButton onClick={onDelete} />}
    </div>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Delete"
      title="Delete"
      className="rounded-md p-1.5 text-mute opacity-60 transition hover:bg-stop/10 hover:text-stop group-hover:opacity-100"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

function PostPhoto({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setMsg({ ok: false, text: 'Choose a photo first.' })
    setSaving(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append('file', new File([await shrinkPhoto(file)], 'photo.jpg', { type: 'image/jpeg' }))
      form.append('caption', caption)
      const res = await adminFetch('/api/photos', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error ?? `Upload failed (${res.status})`)
      setMsg({ ok: true, text: 'Posted to the guest page' })
      setFile(null)
      setPreview('')
      setCaption('')
      onDone()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card p-5" onSubmit={submit}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
        <span className="text-volt">
          <ImagePlus className="h-4 w-4" />
        </span>{' '}
        Post poster or photo
      </h2>
      <label className="mt-4 flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-ink">
        {preview ? (
          <img src={preview} alt="Selected" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-mute">Click to choose a photo</span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) {
              setFile(f)
              setPreview(URL.createObjectURL(f))
            }
            e.target.value = ''
          }}
        />
      </label>
      <div className="mt-3">
        <label className="label">Caption</label>
        <input className="field" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder="Opening night crowd" />
      </div>
      <button className="btn-primary mt-4 w-full" disabled={saving}>
        {saving ? 'Uploading…' : 'Post photo'}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-go' : 'text-stop'}`}>{msg.text}</p>}
    </form>
  )
}

function RoleBadge({ role }: { role: Role }) {
  const c = { Player: 'text-go border-go/30', Artist: 'text-volt border-volt/30', Staff: 'text-mute border-line' }[role]
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${c}`}>{role}</span>
}

function RegisterPerson({ teams, onDone }: { teams: { teamId: string; teamName: string }[]; onDone: () => void }) {
  const [form, setForm] = useState({ userId: '', fullName: '', role: 'Player' as Role, teamId: '' })
  const [face, setFace] = useState<{ vector: number[]; thumbnail: string } | null>(null)
  const [camera, setCamera] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!face) return setMsg({ ok: false, text: 'Add a photo so a face embedding can be generated.' })
    setSaving(true)
    setMsg(null)
    try {
      const r = await post('/api/register-user', {
        ...form,
        teamId: form.role === 'Player' && form.teamId ? form.teamId : null,
        faceVector: face.vector,
        photo: face.thumbnail,
      })
      setMsg({ ok: true, text: r.message })
      setForm({ userId: '', fullName: '', role: form.role, teamId: '' })
      setFace(null)
      onDone()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-volt" />
        <h2 className="text-lg font-bold">Register a person</h2>
      </div>
      <p className="mt-1 text-sm text-mute">
        The photo is turned into a 128-point face embedding on this computer — only the vector and a small thumbnail are
        stored.
      </p>
      <div className="mt-5 grid gap-5 md:grid-cols-[200px_1fr]">
        <div>
          {camera ? (
            <CameraPanel
              facing="user"
              captureLabel="Use"
              onFrame={(v) => {
                setFace(fromSource(v, v.videoWidth, v.videoHeight))
                setCamera(false)
              }}
            />
          ) : (
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-ink">
              {face ? (
                <img src={face.thumbnail} alt="Registration" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-mute">No photo</span>
              )}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="btn-ghost cursor-pointer px-2 text-xs">
              <Upload className="h-3.5 w-3.5" /> Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setFace(await processPhotoFile(f))
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" className="btn-ghost px-2 text-xs" onClick={() => setCamera((c) => !c)}>
              {camera ? 'Cancel' : 'Camera'}
            </button>
          </div>
          {face && <EmbeddingStrip vector={face.vector} />}
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <div>
            <label className="label">User ID</label>
            <input
              className="field font-mono uppercase"
              required
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value.toUpperCase() })}
              placeholder="USER_100"
            />
          </div>
          <div>
            <label className="label">Full name</label>
            <input
              className="field"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Alex Smith"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option>Player</option>
              <option>Artist</option>
              <option>Staff</option>
            </select>
          </div>
          <div>
            <label className="label">Team</label>
            <select
              className="field"
              value={form.teamId}
              disabled={form.role !== 'Player'}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
            >
              <option value="">{form.role === 'Player' ? 'No team' : 'Players only'}</option>
              {teams.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? 'Registering…' : 'Register with face embedding'}
            </button>
            {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-go' : 'text-stop'}`}>{msg.text}</p>}
          </div>
        </div>
      </div>
    </form>
  )
}

// Visual fingerprint of the embedding (8×16 grid) so admins can see a vector was produced
function EmbeddingStrip({ vector }: { vector: number[] }) {
  const max = Math.max(...vector.map(Math.abs)) || 1
  return (
    <div className="mt-2">
      <div className="label !mb-1">Embedding · 128-d</div>
      <div className="grid grid-cols-16 gap-px overflow-hidden rounded">
        {vector.map((v, i) => (
          <div
            key={i}
            className="aspect-square"
            style={{ background: v >= 0 ? `rgb(198 244 50 / ${v / max})` : `rgb(52 211 153 / ${-v / max})` }}
          />
        ))}
      </div>
    </div>
  )
}

type Field = {
  name: string
  label: string
  placeholder?: string
  required?: boolean
  mono?: boolean
  type?: string
  half?: boolean
  options?: [string, string][]
}

function QuickForm({
  icon,
  title,
  fields,
  submit,
  onDone,
}: {
  icon: ReactNode
  title: string
  fields: Field[]
  submit: (values: Record<string, string>) => Promise<string>
  onDone: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="card p-5"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
          setMsg({ ok: true, text: await submit(values) })
          setValues({})
          onDone()
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message })
        } finally {
          setSaving(false)
        }
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
        <span className="text-volt">{icon}</span> {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.name} className={f.half ? '' : 'col-span-2'}>
            <label className="label">{f.label}</label>
            {f.options ? (
              <select
                className="field"
                required={f.required}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              >
                <option value="">Select…</option>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={`field ${f.mono ? 'font-mono uppercase' : ''}`}
                type={f.type ?? 'text'}
                required={f.required}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      <button className="btn-primary mt-4 w-full" disabled={saving}>
        {saving ? 'Saving…' : title}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-go' : 'text-stop'}`}>{msg.text}</p>}
    </form>
  )
}
