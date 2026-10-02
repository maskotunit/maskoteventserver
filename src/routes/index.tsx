import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  CloudDownload,
  CloudUpload,
  LayoutDashboard,
  ScanFace,
  ScanLine,
  Shirt,
  Upload,
  UserX,
  Wand2,
} from 'lucide-react'
import { CameraPanel } from '@/components/CameraPanel'
import { VerdictOverlay } from '@/components/VerdictOverlay'
import { fromSource, processPhotoFile, randomFace, simulateCapture } from '@/lib/face'
import * as gate from '@/lib/gate'
import { getAll, type LocalEvent } from '@/lib/localdb'
import type { Person } from '@/lib/types'
import { useOnline } from '@/lib/useOnline'

export const Route = createFileRoute('/')({
  component: GateConsole,
})

type Mode = 'ticket' | 'team' | 'face'

const MODES: { id: Mode; label: string; icon: typeof ScanLine; hint: string }[] = [
  { id: 'ticket', label: 'Ticket', icon: ScanLine, hint: 'Scan QR / barcode' },
  { id: 'team', label: 'Team tag', icon: Shirt, hint: 'Read jersey or lanyard' },
  { id: 'face', label: 'Face ID', icon: ScanFace, hint: 'Players, artists & crew' },
]

function GateConsole() {
  const online = useOnline()
  const [mode, setMode] = useState<Mode>('ticket')
  const [verdict, setVerdict] = useState<gate.Verdict | null>(null)
  const [status, setStatus] = useState<gate.LocalStatus | null>(null)
  const [events, setEvents] = useState<LocalEvent[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [busy, setBusy] = useState<'' | 'down' | 'up'>('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    const [s, e, p] = await Promise.all([gate.localStatus(), gate.recentEvents(), getAll('users')])
    setStatus(s)
    setEvents(e)
    setPeople(p.sort((a, b) => a.fullName.localeCompare(b.fullName)))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const show = useCallback(
    async (v: Promise<gate.Verdict>) => {
      setVerdict(await v)
      refresh()
    },
    [refresh],
  )

  async function runSync(kind: 'down' | 'up') {
    setBusy(kind)
    setNotice(null)
    try {
      if (kind === 'down') {
        const { uploadedFirst, pkg } = await gate.syncDown()
        setNotice({
          tone: 'ok',
          text: `${uploadedFirst ? 'Pending scans uploaded, then r' : 'R'}oster downloaded: ${pkg.tickets.length} tickets, ${pkg.users.length} people. Safe to go 100% offline.`,
        })
      } else {
        const r = await gate.syncUp()
        setNotice({
          tone: r.ticketConflicts.length ? 'err' : 'ok',
          text: `Uploaded ${r.eventsStored} scan events · ${r.ticketsMarkedUsed} tickets marked used${
            r.ticketConflicts.length ? ` · ${r.ticketConflicts.length} already used at another gate: ${r.ticketConflicts.join(', ')}` : ''
          }.`,
        })
      }
    } catch (e) {
      setNotice({ tone: 'err', text: online ? `Sync failed: ${(e as Error).message}` : 'No connection — sync needs a network.' })
    } finally {
      setBusy('')
      refresh()
    }
  }

  const closeVerdict = useCallback(() => setVerdict(null), [])
  const synced = !!status?.lastSyncDown
  const pending = (status?.pendingEvents ?? 0) + (status?.pendingTickets ?? 0)

  return (
    <>
      <VerdictOverlay verdict={verdict} onClose={closeVerdict} />

      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="mb-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 active:bg-blue-700"
          >
            <LayoutDashboard className="h-5 w-5" /> Go to Control room
          </Link>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-volt">
            {status?.deviceId ?? 'GATE-····'} · Entry lane
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Gate console</h1>
          <p className="mt-1 max-w-xl text-sm text-mute">
            Every check runs against the roster stored on this device. Download it on Wi-Fi, then work with no signal
            at all.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {!synced && status && (
            <div className="card flex flex-wrap items-center gap-4 border-volt/40 p-5">
              <CloudDownload className="h-8 w-8 text-volt" />
              <div className="flex-1">
                <div className="font-bold">This device has no roster yet</div>
                <p className="text-sm text-mute">Download tickets, teams and face embeddings before doors open.</p>
              </div>
              <button className="btn-primary" disabled={!!busy || !online} onClick={() => runSync('down')}>
                {busy === 'down' ? 'Downloading…' : 'Download roster'}
              </button>
            </div>
          )}

          <div className="card p-2">
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-xl px-3 py-3 text-left transition ${
                    mode === m.id ? 'bg-volt text-ink' : 'text-mute hover:bg-raised hover:text-chalk'
                  }`}
                >
                  <m.icon className="h-5 w-5" />
                  <div className="mt-2 text-sm font-bold">{m.label}</div>
                  <div className={`hidden text-xs sm:block ${mode === m.id ? 'text-ink/70' : ''}`}>{m.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            {mode === 'ticket' && <TicketScanner onVerdict={show} />}
            {mode === 'team' && <TeamScanner onVerdict={show} />}
            {mode === 'face' && <FaceScanner onVerdict={show} people={people} />}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest">On-device roster</h2>
              <span className={`text-xs font-semibold ${synced ? 'text-go' : 'text-hold'}`}>
                {synced ? 'Offline-ready' : 'Not synced'}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  ['Tickets', status?.counts.tickets],
                  ['Teams', status?.counts.teams],
                  ['People', status?.counts.users],
                  ['Sets', status?.counts.performances],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-raised px-3 py-2">
                  <dt className="text-[10px] uppercase tracking-widest text-mute">{k}</dt>
                  <dd className="font-mono text-xl font-bold">{v ?? '–'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-1 text-xs text-mute">
              <div className="flex justify-between">
                <span>Last download</span>
                <span className="font-mono text-chalk">{gate.formatTime(status?.lastSyncDown)}</span>
              </div>
              <div className="flex justify-between">
                <span>Last upload</span>
                <span className="font-mono text-chalk">{gate.formatTime(status?.lastSyncUp)}</span>
              </div>
              <div className="flex justify-between">
                <span>Waiting to upload</span>
                <span className={`font-mono ${pending ? 'text-hold' : 'text-chalk'}`}>
                  {status?.pendingEvents ?? 0} scans
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn-ghost" disabled={!!busy || !online} onClick={() => runSync('down')}>
                <CloudDownload className="h-4 w-4" />
                {busy === 'down' ? 'Syncing…' : 'Sync down'}
              </button>
              <button
                className="btn-ghost"
                disabled={!!busy || !online || !pending}
                onClick={() => runSync('up')}
              >
                <CloudUpload className="h-4 w-4" />
                {busy === 'up' ? 'Uploading…' : 'Sync up'}
              </button>
            </div>
            {!online && <p className="mt-3 text-xs text-hold">Offline — scanning still works. Sync when back on a network.</p>}
            {notice && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${notice.tone === 'ok' ? 'bg-go/10 text-go' : 'bg-stop/10 text-stop'}`}>
                {notice.text}
              </p>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest">Lane activity</h2>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-mute">No checks yet on this device.</p>
            ) : (
              <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {events.map((e) => (
                  <li key={e.clientId} className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot(e.outcome)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{label(e)}</div>
                      <div className="truncate font-mono text-[11px] text-mute">{e.input}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[11px] text-mute">
                        {new Date(e.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {!e.synced && <div className="text-[10px] font-semibold uppercase text-hold">queued</div>}
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

function dot(outcome: string) {
  if (['granted', 'team_valid', 'face_match'].includes(outcome)) return 'bg-go'
  if (outcome === 'duplicate') return 'bg-hold'
  return 'bg-stop'
}

function label(e: LocalEvent) {
  switch (e.outcome) {
    case 'granted':
      return `Ticket accepted${e.detail ? ` · ${e.detail}` : ''}`
    case 'duplicate':
      return 'Duplicate ticket'
    case 'fraud':
      return 'Unknown ticket'
    case 'team_valid':
      return `Team · ${e.detail}`
    case 'team_unknown':
      return 'Unrecognised team tag'
    case 'face_match':
      return `Face match · ${e.detail.split(' @ ')[0]}`
    default:
      return 'Face not recognised'
  }
}

type ScannerProps = { onVerdict: (v: Promise<gate.Verdict>) => void }

function TicketScanner({ onVerdict }: ScannerProps) {
  const [code, setCode] = useState('')
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <CameraPanel facing="environment" onCode={(c) => onVerdict(gate.scanTicket(c))} />
      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          onVerdict(gate.scanTicket(code))
          setCode('')
        }}
      >
        <h3 className="text-xl font-bold">Ticket check-in</h3>
        <p className="mt-1 text-sm text-mute">
          Point the camera at the ticket code, or type it. Each ticket admits once — re-scans are flagged.
        </p>
        <label className="label mt-5" htmlFor="ticket">
          Ticket code
        </label>
        <input
          id="ticket"
          className="field font-mono uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="TICKET_ABC_123"
          autoComplete="off"
        />
        <button className="btn-primary mt-3" disabled={!code.trim()}>
          <ScanLine className="h-4 w-4" /> Check ticket
        </button>
        <p className="mt-auto pt-5 text-xs text-mute">
          Demo codes: <code className="text-chalk">TICKET_ABC_123</code>, <code className="text-chalk">TICKET_DEF_456</code>,{' '}
          <code className="text-chalk">TICKET_JKL_012</code> (already used)
        </p>
      </form>
    </div>
  )
}

function TeamScanner({ onVerdict }: ScannerProps) {
  const [text, setText] = useState('')
  return (
    <form
      className="max-w-lg"
      onSubmit={(e) => {
        e.preventDefault()
        onVerdict(gate.verifyTeamTag(text))
        setText('')
      }}
    >
      <h3 className="text-xl font-bold">Team tag verification</h3>
      <p className="mt-1 text-sm text-mute">
        Enter the team name read from the player’s jersey, bib or lanyard. Partial matches count — “tigers” finds
        Red Tigers.
      </p>
      <label className="label mt-5" htmlFor="tag">
        Text on tag
      </label>
      <div className="flex gap-2">
        <input
          id="tag"
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Red Tigers"
          autoComplete="off"
        />
        <button className="btn-primary shrink-0" disabled={!text.trim()}>
          Verify
        </button>
      </div>
    </form>
  )
}

function FaceScanner({ onVerdict, people }: ScannerProps & { people: Person[] }) {
  const [who, setWho] = useState('')
  const [working, setWorking] = useState(false)

  async function fromFile(file?: File) {
    if (!file) return
    setWorking(true)
    try {
      const { vector } = await processPhotoFile(file)
      onVerdict(gate.identifyFace(vector))
    } finally {
      setWorking(false)
    }
  }

  const target = people.find((p) => p.userId === who) ?? people[0]

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <CameraPanel
        facing="user"
        captureLabel="Identify"
        onFrame={(v) => onVerdict(gate.identifyFace(fromSource(v, v.videoWidth, v.videoHeight).vector))}
      />
      <div className="flex flex-col">
        <h3 className="text-xl font-bold">Face identification</h3>
        <p className="mt-1 text-sm text-mute">
          The live face is converted to a 128-point embedding and compared against every registered person on this
          device. Artists show their set times.
        </p>
        <label className="btn-ghost mt-5 cursor-pointer">
          <Upload className="h-4 w-4" />
          {working ? 'Processing…' : 'Identify from photo'}
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
        </label>

        <div className="mt-6 rounded-xl border border-dashed border-line p-4">
          <div className="label">Rehearsal mode</div>
          <p className="mb-3 text-xs text-mute">Simulate a live capture to train staff without a real face.</p>
          <select className="field" value={target?.userId ?? ''} onChange={(e) => setWho(e.target.value)} disabled={!people.length}>
            {people.length === 0 && <option>Sync the roster first</option>}
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.fullName} — {p.role}
              </option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="btn-ghost"
              disabled={!target}
              onClick={() => target && onVerdict(gate.identifyFace(simulateCapture(target.faceVector)))}
            >
              <Wand2 className="h-4 w-4" /> Registered
            </button>
            <button className="btn-ghost" onClick={() => onVerdict(gate.identifyFace(randomFace()))}>
              <UserX className="h-4 w-4" /> Stranger
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
