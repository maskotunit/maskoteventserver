import { Link, useRouterState } from '@tanstack/react-router'
import { useOnline } from '@/lib/useOnline'

export function AppHeader() {
  const online = useOnline()
  const guest = useRouterState({ select: (s) => s.location.pathname.startsWith('/guest') })
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link to={guest ? '/guest' : '/'} className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-black uppercase tracking-[0.18em]">Gatehouse</span>
        </Link>
        {!guest && (
          <nav className="ml-2 flex gap-1 text-sm">
            {([
              ['/', 'Gate'],
              ['/admin', 'Control room'],
              ['/guest', 'Guests'],
            ] as const).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: true }}
                className="rounded-md px-3 py-1.5 text-mute transition hover:text-chalk"
                activeProps={{ className: 'bg-raised !text-chalk' }}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        {!guest && (
          <span
            className={`ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              online ? 'border-go/30 text-go' : 'border-hold/40 text-hold'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${online ? 'bg-go' : 'animate-pulse bg-hold'}`} />
            {online ? 'Online' : 'Offline mode'}
          </span>
        )}
      </div>
      <div className="band h-[3px] opacity-70" />
    </header>
  )
}
