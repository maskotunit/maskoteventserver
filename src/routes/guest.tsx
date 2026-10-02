import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Camera, Heart, Sparkles, Star, X } from 'lucide-react'
import type { GuestPhoto, ScheduleSlot } from '@/lib/types'

export const Route = createFileRoute('/guest')({
  head: () => ({ meta: [{ title: 'Guest page · Gatehouse' }] }),
  component: GuestPage,
})

const VISITOR_KEY = 'gatehouse-visitor'

// Guests react without signing in: each browser gets a random ID kept in localStorage
function visitorId() {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function GuestPage() {
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null)
  const [photos, setPhotos] = useState<GuestPhoto[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<GuestPhoto | null>(null)
  const [now, setNow] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        fetch('/api/schedule', { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/photos?visitor=${encodeURIComponent(visitorId())}`, { cache: 'no-store' }).then((r) => r.json()),
      ])
      setSlots(s.slots ?? [])
      setPhotos(p.photos ?? [])
      setError('')
    } catch {
      setError('Connect to the internet to see the latest photos and schedule.')
    }
  }, [])

  useEffect(() => {
    load()
    setNow(nowHHMM())
    const t = setInterval(() => setNow(nowHHMM()), 30_000)
    return () => clearInterval(t)
  }, [load])

  async function react(photo: GuestPhoto, next: GuestPhoto['mine']) {
    const prev = photo
    const updated: GuestPhoto = {
      ...photo,
      mine: next,
      likes: photo.likes + (next.liked ? 1 : 0) - (photo.mine.liked ? 1 : 0),
      ...rerate(photo, next.stars),
    }
    const swap = (p: GuestPhoto) => setPhotos((list) => list?.map((x) => (x.photoId === p.photoId ? p : x)) ?? null)
    swap(updated)
    setOpen((o) => (o?.photoId === photo.photoId ? updated : o))
    try {
      const res = await fetch('/api/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.photoId, visitorId: visitorId(), ...next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      swap(prev)
      setOpen((o) => (o?.photoId === photo.photoId ? prev : o))
      setError('Your reaction could not be saved. Check your connection and try again.')
    }
  }

  return (
    <>
      <section className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-volt">For guests · no sign-in needed</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">What's on</h1>
        <p className="mt-1 max-w-xl text-sm text-mute">
          See what's on now and next, browse event posters and photos, and leave a like or a star rating.
        </p>
      </section>

      {error && <p className="mb-6 rounded-lg bg-stop/10 px-4 py-3 text-sm text-stop">{error}</p>}

      {slots && slots.length > 0 && now && <NowNext slots={slots} now={now} poster={photos?.[0]} />}

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
            <CalendarClock className="h-4 w-4 text-volt" /> Performance schedule
          </h2>
          <div className="card divide-y divide-line lg:sticky lg:top-20">
            {slots === null ? (
              <p className="p-4 text-sm text-mute">Loading…</p>
            ) : slots.length === 0 ? (
              <p className="p-4 text-sm text-mute">The lineup hasn't been announced yet.</p>
            ) : (
              slots.map((s) => {
                const live = now && s.startTime <= now && now < s.endTime
                const done = now && s.endTime <= now
                return (
                  <div key={s.perfId} className={`flex gap-4 px-4 py-3 ${done ? 'opacity-45' : ''}`}>
                    <div className="w-[88px] shrink-0 font-mono text-sm text-volt">
                      {s.startTime}
                      <span className="text-mute">–{s.endTime}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{s.artistName}</div>
                      <div className="text-xs text-mute">{s.stageName}</div>
                    </div>
                    {live && (
                      <span className="inline-flex h-fit items-center gap-1.5 rounded-full border border-go/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-go">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-go" /> On now
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
            <Camera className="h-4 w-4 text-volt" /> Posters & photos
          </h2>
          {photos === null ? (
            <p className="text-sm text-mute">Loading…</p>
          ) : photos.length === 0 ? (
            <div className="card p-8 text-center text-sm text-mute">No posters or photos yet. Check back once the event gets going.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((p) => (
                <PhotoCard key={p.photoId} photo={p} onOpen={() => setOpen(p)} onReact={(n) => react(p, n)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/90 p-4 backdrop-blur verdict-in"
          onClick={() => setOpen(null)}
        >
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button className="btn-ghost px-2 py-1.5" onClick={() => setOpen(null)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <img src={open.url} alt={open.caption} className="max-h-[75vh] w-full rounded-xl object-contain" />
            <div className="mt-3">
              <Reactions photo={open} onReact={(n) => react(open, n)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Poster-style banner for the set on stage now and the one coming up next
function NowNext({ slots, now, poster }: { slots: ScheduleSlot[]; now: string; poster?: GuestPhoto }) {
  const live = slots.find((s) => s.startTime <= now && now < s.endTime)
  const next = slots.find((s) => s.startTime > now)
  if (!live && !next) return null
  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-panel">
      {poster && (
        <img src={poster.url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/30" />
      <div className="relative grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
        {live && <Feature tag="On now" tone="text-go" slot={live} />}
        {next && <Feature tag="Next event" tone="text-volt" slot={next} />}
      </div>
    </section>
  )
}

function Feature({ tag, tone, slot }: { tag: string; tone: string; slot: ScheduleSlot }) {
  return (
    <div>
      <p className={`flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-[0.2em] ${tone}`}>
        <Sparkles className="h-3.5 w-3.5" /> {tag}
      </p>
      <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{slot.artistName}</h2>
      <p className="mt-1 text-sm text-mute">
        {slot.stageName} · <span className="font-mono text-chalk">{slot.startTime}–{slot.endTime}</span>
      </p>
    </div>
  )
}

// Recompute the visible average after this guest changes their own rating
function rerate(p: GuestPhoto, stars: number | null) {
  let sum = (p.ratingAvg ?? 0) * p.ratingCount
  let count = p.ratingCount
  if (p.mine.stars) {
    sum -= p.mine.stars
    count--
  }
  if (stars) {
    sum += stars
    count++
  }
  return { ratingCount: count, ratingAvg: count ? Math.round((sum / count) * 10) / 10 : null }
}

function PhotoCard({
  photo,
  onOpen,
  onReact,
}: {
  photo: GuestPhoto
  onOpen: () => void
  onReact: (next: GuestPhoto['mine']) => void
}) {
  return (
    <figure className="card overflow-hidden">
      <button className="block w-full" onClick={onOpen} aria-label="View larger">
        <img src={photo.url} alt={photo.caption} loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:opacity-90" />
      </button>
      <figcaption className="p-3">
        {photo.caption && <p className="mb-2 text-sm">{photo.caption}</p>}
        <Reactions photo={photo} onReact={onReact} />
      </figcaption>
    </figure>
  )
}

function Reactions({ photo, onReact }: { photo: GuestPhoto; onReact: (next: GuestPhoto['mine']) => void }) {
  const [hover, setHover] = useState(0)
  const { liked, stars } = photo.mine
  const shown = hover || stars || 0
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        onClick={() => onReact({ liked: !liked, stars })}
        aria-pressed={liked}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition ${
          liked ? 'border-stop/40 bg-stop/10 text-stop' : 'border-line text-mute hover:text-chalk'
        }`}
      >
        <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} /> {photo.likes}
      </button>
      <div className="flex items-center gap-2">
        <div className="flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rate this photo">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onMouseEnter={() => setHover(n)}
              // Tapping your current rating again clears it
              onClick={() => onReact({ liked, stars: stars === n ? null : n })}
              className="p-0.5"
            >
              <Star className={`h-5 w-5 transition ${n <= shown ? 'fill-hold text-hold' : 'text-line'}`} />
            </button>
          ))}
        </div>
        <span className="w-14 text-right font-mono text-xs text-mute">
          {photo.ratingAvg ?? '–'} <span className="opacity-70">({photo.ratingCount})</span>
        </span>
      </div>
    </div>
  )
}
