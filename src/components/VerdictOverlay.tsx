import { useEffect } from 'react'
import { CheckCircle2, Clock, ShieldAlert, X } from 'lucide-react'
import type { Verdict } from '@/lib/gate'

const TONES = {
  green: { bg: 'bg-go', icon: CheckCircle2 },
  amber: { bg: 'bg-hold', icon: Clock },
  red: { bg: 'bg-stop', icon: ShieldAlert },
}

// Full-screen colour verdict: readable at arm's length in a crowded gate lane
export function VerdictOverlay({ verdict, onClose }: { verdict: Verdict | null; onClose: () => void }) {
  useEffect(() => {
    if (!verdict) return
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter') && onClose()
    window.addEventListener('keydown', onKey)
    navigator.vibrate?.(verdict.tone === 'green' ? 80 : [120, 60, 120])
    return () => window.removeEventListener('keydown', onKey)
  }, [verdict, onClose])

  if (!verdict) return null
  const { bg, icon: Icon } = TONES[verdict.tone]
  const p = verdict.person
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 text-ink ${bg} verdict-in`}
    >
      <button onClick={onClose} className="absolute right-5 top-5 rounded-full bg-ink/10 p-2" aria-label="Dismiss">
        <X className="h-6 w-6" />
      </button>
      <div className="w-full max-w-lg text-center" onClick={(e) => p && e.stopPropagation()}>
        <Icon className="mx-auto h-20 w-20" strokeWidth={2.4} />
        <h2 className="mt-4 text-4xl font-black uppercase tracking-tight sm:text-5xl">{verdict.title}</h2>
        <p className="mt-3 text-lg font-medium opacity-80">{verdict.message}</p>

        {p && (
          <div className="mt-6 rounded-2xl bg-ink p-5 text-left text-chalk">
            <div className="flex items-center gap-4">
              {p.photo ? (
                <img src={p.photo} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-raised text-xl font-bold">
                  {p.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xl font-bold">{p.fullName}</div>
                <div className="font-mono text-xs text-mute">
                  {p.userId} · {p.role}
                  {p.teamName ? ` · ${p.teamName}` : ''}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] uppercase tracking-widest text-mute">Distance</div>
                <div className="font-mono text-lg text-go">{p.distance.toFixed(3)}</div>
              </div>
            </div>
            {p.role === 'Artist' && (
              <div className="mt-4 border-t border-line pt-4">
                <div className="label">Performance schedule</div>
                {p.performances?.length ? (
                  <ul className="space-y-2">
                    {p.performances.map((perf) => (
                      <li key={perf.perfId} className="flex justify-between rounded-lg bg-raised px-3 py-2 text-sm">
                        <span className="font-semibold">{perf.stageName}</span>
                        <span className="font-mono text-volt">
                          {perf.startTime} – {perf.endTime}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-mute">No scheduled performances.</p>
                )}
              </div>
            )}
            <button onClick={onClose} className="btn-primary mt-5 w-full">
              Next in line
            </button>
          </div>
        )}
        {!p && <p className="mt-8 text-sm font-semibold uppercase tracking-widest opacity-60">Tap anywhere for next</p>}
      </div>
    </div>
  )
}
