import { AppBar, Sizer } from '@/components'
import { recentSongsAtom } from '@/features/persist/recentSongs'
import { useSongMetadata } from '@/features/data/library'
import { Logo } from '@/icons'
import { formatTime } from '@/utils'
import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { Clock, Music } from 'lucide-react'
import { Link } from 'react-router'

export default function Home() {
  const recentSongs = useAtomValue(recentSongsAtom)

  return (
    <>
      <title>CueKey</title>
      <div className="flex min-h-screen flex-col bg-[#0f1014] text-white">
        <AppBar />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-4xl flex-col gap-10 md:flex-row md:items-start md:gap-16">
            {/* Hero section */}
            <div className="flex flex-col items-center gap-6 pt-12 text-center md:items-start md:pt-0 md:text-left">
              <div className="flex items-center gap-3">
                <Logo height={40} width={40} />
                <h1 className="text-5xl font-extralight tracking-tight">CUEKEY</h1>
              </div>
              <p className="max-w-sm text-base text-gray-400">
                Plug in your keyboard and learn piano, right in your browser.
              </p>
              <div className="flex gap-3">
                <Link
                  to="/songs"
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 active:bg-emerald-700"
                >
                  Learn to play
                </Link>
                <Link
                  to="/freeplay"
                  className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium text-gray-200 transition hover:border-white/30 hover:bg-white/5"
                >
                  Free play
                </Link>
              </div>
            </div>

            {/* Recent songs panel */}
            <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
                <Clock className="h-4 w-4 text-gray-500" />
                Recently played
              </div>
              {recentSongs.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-gray-500">
                  <Music className="h-8 w-8" />
                  <p className="text-sm">No songs played yet.</p>
                  <p className="text-xs">Pick a song to get started.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {recentSongs.map((song) => (
                    <RecentSongRow key={`${song.source}/${song.id}`} song={song} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function RecentSongRow({ song }: { song: { id: string; source: string; title: string; duration: number; playedAt: number } }) {
  const meta = useSongMetadata(song.id, song.source as any)
  const title = meta?.title ?? song.title

  return (
    <Link
      to={`/play?source=${encodeURIComponent(song.source)}&id=${encodeURIComponent(song.id)}`}
      className={clsx(
        'flex items-center justify-between rounded-md px-3 py-2 transition',
        'hover:bg-white/5',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">{title}</p>
        <p className="text-xs text-gray-500">
          {formatTime(song.duration)} · {relativeTime(song.playedAt)}
        </p>
      </div>
    </Link>
  )
}

function relativeTime(timestamp: number): string {
  const secs = Math.floor((Date.now() - timestamp) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}
