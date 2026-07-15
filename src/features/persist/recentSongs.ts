import type { SongMetadata, SongSource } from '@/types'
import { atom, getDefaultStore } from 'jotai'
import { isBrowser } from '@/utils'

const STORAGE_KEY = 'RECENT_SONGS'
const MAX_RECENT = 10

const store = getDefaultStore()

export interface RecentSong {
  id: string
  source: SongSource
  title: string
  duration: number
  playedAt: number // Date.now()
}

function load(): RecentSong[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RecentSong[]) : []
  } catch {
    return []
  }
}

function save(songs: RecentSong[]) {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
  } catch { /* ignore quota errors */ }
}

export const recentSongsAtom = atom<RecentSong[]>(load())

/** Record a song as recently played. Moves it to the top, caps at MAX_RECENT. */
export function recordRecentSong(meta: SongMetadata) {
  const current = store.get(recentSongsAtom)
  // Remove existing entry for same id+source
  const filtered = current.filter((s) => !(s.id === meta.id && s.source === meta.source))
  const entry: RecentSong = {
    id: meta.id,
    source: meta.source,
    title: meta.title,
    duration: meta.duration,
    playedAt: Date.now(),
  }
  const next = [entry, ...filtered].slice(0, MAX_RECENT)
  store.set(recentSongsAtom, next)
  save(next)
}
