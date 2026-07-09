// TODO: handle when users don't have an AudioContext supporting browser
import { getSynthStub, InstrumentName } from '@/features/synth'
import { transposeMidi } from '@/features/theory'
import { MidiStateEvent, Song, SongConfig, SongMeasure, SongNote } from '@/types'
import { clamp, getHands, round } from '@/utils'
import { atom, Atom, getDefaultStore, PrimitiveAtom } from 'jotai'
import midi, { loopbackEnabledAtom } from '../midi'
import { getSynth, Synth } from '../synth'

function increment(x: number) {
  return x + 1
}

/** Find the index of a note in song.notes by matching time + midiNote + track. */
function findNoteIndex(song: Song, target: SongNote): number {
  // Binary search by time, then linear scan for exact match
  const notes = song.notes
  let lo = 0
  let hi = notes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const n = notes[mid]
    if (n.time < target.time) {
      lo = mid + 1
    } else if (n.time > target.time) {
      hi = mid - 1
    } else {
      // Found time match — scan left for earliest, then right for exact
      let start = mid
      while (start > 0 && notes[start - 1].time === target.time) start--
      for (let i = start; i < notes.length && notes[i].time === target.time; i++) {
        if (
          notes[i].midiNote === target.midiNote &&
          notes[i].track === target.track
        ) {
          return i
        }
      }
      // Fell through — try the other side of mid
      lo = mid + 1
    }
  }
  return -1
}

// ---- Pre-computed hand & fingering maps (built at song load time) ----

/** Hand assignment for every note index in the song. */
type HandMap = Map<number, 'left' | 'right'>
/** Finger assignment (1-5) for every note index in the song. */
type FingerMap = Map<number, number>

/**
 * Pre-compute hand and finger assignments for all notes in a song.
 * Called once at song load time so per-frame lookups are O(1).
 */
function computeHandAndFingerMaps(
  song: Song,
  songHands: { left?: number; right?: number },
): { handMap: HandMap; fingerMap: FingerMap } {
  const handMap: HandMap = new Map()
  const fingerMap: FingerMap = new Map()

  const isSingleTrack = songHands.left === songHands.right
  const notes = song.notes

  // ---- Pass 1: group notes into time slices (chords) ----
  interface Slice {
    indices: number[]       // indices into song.notes
    midiNotes: number[]     // corresponding MIDI pitches (sorted low→high)
    time: number
  }
  const slices: Slice[] = []
  let i = 0
  while (i < notes.length) {
    const startTime = notes[i].time
    const slice: Slice = { indices: [], midiNotes: [], time: startTime }
    while (i < notes.length && notes[i].time < startTime + CHORD_WINDOW) {
      slice.indices.push(i)
      slice.midiNotes.push(notes[i].midiNote)
      i++
    }
    // Sort midiNotes low→high while keeping index alignment
    const paired = slice.indices.map((idx, j) => ({ idx, midi: slice.midiNotes[j] }))
    paired.sort((a, b) => a.midi - b.midi)
    slice.indices = paired.map((p) => p.idx)
    slice.midiNotes = paired.map((p) => p.midi)
    slices.push(slice)
  }

  // ---- Pass 2: assign hands per slice ----
  const sliceHands: Array<'left' | 'right' | 'split'> = []

  for (const slice of slices) {
    if (!isSingleTrack) {
      // Multi-track: use track-based assignment
      const firstIdx = slice.indices[0]
      const track = notes[firstIdx].track
      if (track === songHands.left) {
        sliceHands.push('left')
      } else if (track === songHands.right) {
        sliceHands.push('right')
      } else {
        // Unknown track — use pitch heuristic, but only one hand per slice
        const avgPitch = slice.midiNotes.reduce((a, b) => a + b, 0) / slice.midiNotes.length
        sliceHands.push(avgPitch < 60 ? 'left' : 'right')
      }
      continue
    }

    // Single-track: algorithmic split
    if (slice.indices.length === 1) {
      // Single note — defer to continuity pass
      sliceHands.push('left') // placeholder, fixed in pass 3
      continue
    }

    // Multiple notes: split at largest pitch gap
    const gaps: Array<{ gap: number; splitAt: number }> = []
    for (let j = 0; j < slice.midiNotes.length - 1; j++) {
      const gap = slice.midiNotes[j + 1] - slice.midiNotes[j]
      gaps.push({ gap, splitAt: slice.midiNotes[j] + Math.floor(gap / 2) })
    }
    const maxGap = gaps.reduce((best, g) => (g.gap > best.gap ? g : best), gaps[0])

    if (maxGap.gap > 4) {
      // Significant gap: split the slice
      sliceHands.push('split')
      // Store the split point on the slice for later use
      ;(slice as any)._splitAt = maxGap.splitAt
    } else {
      // Cluster — assign entire slice to one hand based on average pitch
      const avgPitch = slice.midiNotes.reduce((a, b) => a + b, 0) / slice.midiNotes.length
      sliceHands.push(avgPitch < 60 ? 'left' : 'right')
    }
  }

  // ---- Pass 3: continuity pass for single-note slices ----
  // A single-note slice between two same-hand slices inherits that hand
  for (let s = 0; s < slices.length; s++) {
    if (sliceHands[s] !== 'left' || slices[s].indices.length > 1) continue
    // This is a placeholder single-note slice

    // Look backward and forward for context
    let prevHand: 'left' | 'right' | null = null
    let nextHand: 'left' | 'right' | null = null

    for (let p = s - 1; p >= 0 && prevHand === null; p--) {
      if (sliceHands[p] === 'left' || sliceHands[p] === 'right') prevHand = sliceHands[p] as 'left' | 'right'
      else if (sliceHands[p] === 'split') prevHand = null // ambiguous
    }
    for (let n = s + 1; n < slices.length && nextHand === null; n++) {
      if (sliceHands[n] === 'left' || sliceHands[n] === 'right') nextHand = sliceHands[n] as 'left' | 'right'
      else if (sliceHands[n] === 'split') nextHand = null
    }

    const pitch = slices[s].midiNotes[0]
    if (prevHand && nextHand && prevHand === nextHand) {
      // Both neighbors agree — use that hand
      sliceHands[s] = prevHand
    } else if (prevHand) {
      // Only backward context
      sliceHands[s] = prevHand
    } else if (nextHand) {
      // Only forward context
      sliceHands[s] = nextHand
    } else {
      // No context — fall back to C4
      sliceHands[s] = pitch < 60 ? 'left' : 'right'
    }
  }

  // ---- Pass 4: build handMap from slices ----
  for (let s = 0; s < slices.length; s++) {
    const slice = slices[s]
    const hand = sliceHands[s]

    if (hand === 'split') {
      const splitAt = (slice as any)._splitAt ?? 60
      for (let j = 0; j < slice.indices.length; j++) {
        handMap.set(slice.indices[j], slice.midiNotes[j] < splitAt ? 'left' : 'right')
      }
    } else {
      for (const idx of slice.indices) {
        handMap.set(idx, hand)
      }
    }
  }

  // ---- Pass 5: compute fingerMap ----
  // For each slice, assign fingers per hand
  for (let s = 0; s < slices.length; s++) {
    const slice = slices[s]

    // Group notes in this slice by hand
    const byHand = new Map<'left' | 'right', Array<{ idx: number; midi: number }>>()
    for (let j = 0; j < slice.indices.length; j++) {
      const idx = slice.indices[j]
      const hand = handMap.get(idx)!
      if (!byHand.has(hand)) byHand.set(hand, [])
      byHand.get(hand)!.push({ idx, midi: slice.midiNotes[j] })
    }

    for (const [, group] of byHand) {
      // Sort by pitch (low→high) — should already be sorted from Pass 1
      group.sort((a, b) => a.midi - b.midi)
      const midis = group.map((g) => g.midi)

      if (group.length === 1) {
        // Single note: pick a sensible finger based on its position
        // within the hand's typical range
        const midi = midis[0]
        const hand = handMap.get(group[0].idx)!
        const finger = defaultFingerForPitch(midi, hand)
        fingerMap.set(group[0].idx, finger)
      } else {
        // Chord: use interval-based fingering
        const fingers = chordFingers(midis)
        for (let j = 0; j < group.length; j++) {
          fingerMap.set(group[j].idx, fingers[j])
        }
      }
    }
  }

  return { handMap, fingerMap }
}

/**
 * Default finger for a single isolated note in a hand.
 * Thumb (1) for extreme low notes in that hand's range,
 * pinky (5) for extreme high notes, middle (3) for mid-range.
 */
function defaultFingerForPitch(midiNote: number, hand: 'left' | 'right'): number {
  // Typical piano ranges per hand
  // RH: C4(60) to C7(96), comfort zone D4(62) to G5(79)
  // LH: C2(36) to C5(72), comfort zone E2(40) to G4(67)
  if (hand === 'right') {
    if (midiNote <= 60) return 1   // C4 and below → thumb
    if (midiNote <= 65) return 2   // C4-F4 → index
    if (midiNote <= 72) return 3   // F#4-C5 → middle
    if (midiNote <= 79) return 4   // C#5-G5 → ring
    return 5                        // above G5 → pinky
  } else {
    if (midiNote <= 36) return 5   // C2 and below → pinky (LH is reversed)
    if (midiNote <= 43) return 4   // C#2-G2 → ring
    if (midiNote <= 55) return 3   // G#2-G3 → middle
    if (midiNote <= 62) return 2   // G#3-D4 → index
    return 1                        // above D4 → thumb
  }
}

/**
 * Assign finger numbers for a chord (simultaneous notes in same hand),
 * sorted low→high. Uses standard piano chord fingering based on intervals.
 */
function chordFingers(sortedMidis: number[]): number[] {
  const n = sortedMidis.length
  if (n <= 0) return []
  if (n === 1) return [defaultFingerForPitch(sortedMidis[0], 'right')]

  // Compute intervals between adjacent notes
  const intervals: number[] = []
  for (let i = 0; i < n - 1; i++) {
    intervals.push(sortedMidis[i + 1] - sortedMidis[i])
  }
  const totalSpan = sortedMidis[n - 1] - sortedMidis[0]

  if (n === 2) {
    const gap = intervals[0]
    if (gap <= 2) return [1, 2]
    if (gap <= 4) return [1, 3]
    if (gap <= 5) return [1, 4]
    return [1, 5]
  }

  if (n === 3) {
    const [i1, i2] = intervals
    // Root position triad: 3rd + 3rd → 1-3-5
    if (i1 >= 3 && i1 <= 4 && i2 >= 3 && i2 <= 4) return [1, 3, 5]
    // 1st inversion: 4th + 3rd → 1-2-5
    if (i1 >= 5 && i1 <= 6 && i2 >= 3 && i2 <= 4) return [1, 2, 5]
    // 2nd inversion: 3rd + 4th → 1-3-5
    if (i1 >= 3 && i1 <= 4 && i2 >= 5 && i2 <= 6) return [1, 3, 5]
    // Wide or close cluster
    if (totalSpan > 7) return [1, 2, 5]
    if (totalSpan <= 4) return [1, 2, 3]
    return [1, 3, 5]
  }

  if (n === 4) {
    if (totalSpan >= 7) return [1, 2, 3, 5]  // dominant 7th
    if (totalSpan <= 5) return [1, 2, 3, 4]  // cluster
    return [1, 2, 4, 5]
  }

  if (n === 5) return [1, 2, 3, 4, 5]
  // > 5 notes: double some fingers
  return Array.from({ length: n }, (_, i) => Math.min(i + 1, 5))
}

type JotaiStore = ReturnType<typeof getDefaultStore>
const GOOD_RANGE = 300
const PERFECT_RANGE = 50
/** Notes within this time window (seconds) are treated as simultaneous chord. */
const CHORD_WINDOW = 0.10
const DEFAULT_BPM = 120
const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 }

interface Score {
  perfect: PrimitiveAtom<number>
  good: PrimitiveAtom<number>
  missed: PrimitiveAtom<number>
  durationHeld: PrimitiveAtom<number>
  error: PrimitiveAtom<number>
  combined: Atom<number>
  accuracy: Atom<number>
  streak: PrimitiveAtom<number>
}

function getInitialScore(): Score {
  const perfect = atom(0)
  const good = atom(0)
  const missed = atom(0)
  const error = atom(0)
  const durationHeld = atom(0)
  const streak = atom(0)
  const combined = atom(
    (get) => get(perfect) * 100 + get(good) * 50 - get(error) * 25 + get(durationHeld),
  )

  const accuracy = atom((get) => {
    const total = get(hit) + get(missed) + get(error)

    return total === 0 ? 100 : Math.round((100 * get(hit)) / total)
  })

  const hit = atom((get) => {
    return get(perfect) + get(good)
  })

  return { perfect, good, missed, error, durationHeld, combined, accuracy, streak }
}

export type PlayerState = 'CannotPlay' | 'Playing' | 'Paused' | 'CountingDown'

export class Player {
  store: JotaiStore
  state: PrimitiveAtom<PlayerState> = atom<PlayerState>('CannotPlay')
  score: Score = getInitialScore()
  song: PrimitiveAtom<Song | null> = atom<Song | null>(null)
  playInterval: any = null
  currentSongTime = 0
  volume = atom(1)

  // TODO: Determine if MIDI always assumes BPM means quarter notes per minute.
  // Add link to documentation if so.
  bpmModifier = atom(1)
  currentBpmIndex = atom(0)
  currentBpm: Atom<number> = atom((get) => {
    const currSongBpm = get(this.song)?.bpms[get(this.currentBpmIndex)]?.bpm ?? 120
    return currSongBpm * get(this.bpmModifier)
  })

  metronomeVolume = atom(0.6)
  metronomeEnabled = atom(false)
  metronomeSpeed = atom(1)
  metronomeEmphasizeFirst = atom(true)
  countdownEnabled = atom(true)
  countdownTotal = atom(0)
  transpose = atom(0)
  countdownRemaining = atom(0)
  countdownInterval: ReturnType<typeof setInterval> | null = null
  metronomeLastPlayedTick: null | number = null
  metronomeSynth = getSynthStub('woodblock', {
    metronome: true,
  })
  metronomeAccentedSynth = getSynthStub('agogo', {
    metronome: true,
  })

  currentIndex: number = 0
  lastIntervalFiredTime = 0
  playing: Array<SongNote> = []
  synths: Array<Synth> = []
  handlers: any = {}
  range: PrimitiveAtom<null | [number, number]> = atom<null | [number, number]>(null)
  hand = 'both'
  wait = false
  songHands: { left?: number; right?: number } = {}

  /** Pre-computed hand assignment: note index → 'left' | 'right'. Built in setSong(). */
  handMap: HandMap = new Map()
  /** Pre-computed finger assignment: note index → 1-5. Built in setSong(). */
  fingerMap: FingerMap = new Map()

  hitNotes: Set<SongNote> = new Set()
  missedNotes: Set<SongNote> = new Set()
  midiPressedNotes: Set<number> = new Set()
  lateNotes: Map<number, SongNote> = new Map()
  skipMissedNotes = false

  constructor(store: JotaiStore) {
    this.store = store
    midi.subscribe((midiEvent) => this.processMidiEvent(midiEvent))
  }

  getSong() {
    return this.store.get(this.song)
  }

  clearMissedNotes_() {
    let missedNotes = 0
    for (const [midiNote, missedNote] of this.lateNotes.entries()) {
      const diff = this.calcDiff(this.currentSongTime, missedNote.time)
      if (diff > GOOD_RANGE) {
        this.lateNotes.delete(midiNote)
        missedNotes++
        this.missedNotes.add(missedNote)
      }
    }
    if (missedNotes > 0) {
      this.store.set(this.score.streak, 0)
    }
    this.store.set(this.score.missed, (count) => count + missedNotes)
  }

  processMidiEvent(midiEvent: MidiStateEvent) {
    const song = this.getSong()
    if (!song) {
      return
    }

    const midiNote = midiEvent.note
    if (midiEvent.type === 'up') {
      this.midiPressedNotes.delete(midiNote)
      return
    } else {
      this.midiPressedNotes.add(midiNote)
    }

    if (this.isPlaying()) {
      this.processScoreData(midiNote)
    }
  }

  processScoreData(midiNote: number) {
    // First check if the note already passed.
    this.clearMissedNotes_()
    const lateNote = this.lateNotes.get(midiNote)
    if (lateNote) {
      const currentTime = this.currentSongTime
      this.lateNotes.delete(midiNote)
      const diff = this.calcDiff(currentTime, lateNote.time)
      const isHit = diff < GOOD_RANGE
      if (diff < PERFECT_RANGE) {
        this.store.set(this.score.perfect, increment)
      } else if (diff < GOOD_RANGE) {
        this.store.set(this.score.good, increment)
      }
      if (isHit) {
        this.store.set(this.score.streak, increment)
        this.hitNotes.add(lateNote)
        if (this.skipMissedNotes) {
          this.playNote(lateNote)
        }
        return
      }
    }

    // Now handle if the note is upcoming, aka it was hit early
    const nextNote = this.getUpcomingNotes()?.find(
      (note) => this.getTransposedMidi(note.midiNote) === midiNote,
    )
    if (nextNote && !isHitNote(this, nextNote)) {
      const diff = this.calcDiff(nextNote.time, this.currentSongTime)
      if (diff < GOOD_RANGE) {
        diff < PERFECT_RANGE
          ? this.store.set(this.score.perfect, increment)
          : this.store.set(this.score.good, increment)

        this.store.set(this.score.streak, increment)
        this.hitNotes.add(nextNote)
        return
      }
    }

    // Wrong note pressed — strict triggering in wait mode:
    // un-hit all notes in the current chord so the user must
    // release and re-press ALL correct notes together.
    if (this.wait) {
      const upcoming = this.getUpcomingNotes()
      for (const n of upcoming) {
        this.hitNotes.delete(n)
      }
      // Also clear lateNotes for these pitches
      for (const n of upcoming) {
        const t = this.getTransposedMidi(n.midiNote)
        this.lateNotes.delete(t)
      }
    }

    this.store.set(this.score.error, increment)
    this.store.set(this.score.streak, 0)
  }

  // Given two song timestamps, return their difference in milliseconds after adjusting for the bpm modifier
  calcDiff(to: number, from: number) {
    return ((to - from) * 1000) / this.store.get(this.bpmModifier)
  }

  /* Return all notes that are valid to hit */
  getUpcomingNotes() {
    const song = this.getSong()
    const firstUpcomingNote = song?.notes[this.currentIndex]
    if (!firstUpcomingNote) return []

    const upcomingNotes: SongNote[] = []
    for (
      let i = this.currentIndex;
      i < song.notes.length &&
      song.notes[i].time < firstUpcomingNote.time + CHORD_WINDOW;
      i++
    ) {
      upcomingNotes.push(song.notes[i])
    }

    return upcomingNotes
  }

  setWait(wait: boolean) {
    this.wait = wait
  }

  isPlaying() {
    return this.store.get(this.state) === 'Playing'
  }

  isCountingDown() {
    return this.store.get(this.state) === 'CountingDown'
  }

  async setSong(song: Song, songConfig: SongConfig) {
    this.stop()
    this.resetMetronome()
    this.store.set(this.song, song)
    this.songHands = getHands(songConfig)
    // Pre-compute hand + finger maps for all notes
    const maps = computeHandAndFingerMaps(song, this.songHands)
    this.handMap = maps.handMap
    this.fingerMap = maps.fingerMap
    this.store.set(this.state, 'CannotPlay')
    this.applyMetronomeConfig(songConfig.metronome)
    this.applyCountdownConfig(songConfig.countdownEnabled)
    this.applyTransposeConfig(songConfig.transpose)

    const synths: Promise<Synth>[] = []
    Object.entries(song.tracks).forEach(async ([trackId, config]) => {
      const instrument =
        songConfig.tracks[+trackId]?.instrument ?? config.program ?? config.instrument ?? 0
      synths[+trackId] = getSynth(instrument)
    })
    await Promise.all(synths).then((s) => {
      this.synths = s
      // setTrackVolume must be called after synths have been set
      Object.entries(song.tracks).forEach(([trackId]) => {
        const vol = songConfig.tracks[+trackId]?.sound ? 1 : 0
        this.setTrackVolume(+trackId, vol)
      })
      this.store.set(this.state, 'Paused')
    })
    // this.skipMissedNotes = songConfig.skipMissedNotes
    this.wait = songConfig.waiting
  }

  setVolume(vol: number) {
    this.store.set(this.volume, vol)
    this.synths?.forEach((synth) => {
      synth?.setMasterVolume(vol)
    })
  }

  setTrackVolume(track: number | string, vol: number) {
    this.synths?.[+track]?.setMasterVolume(vol)
  }

  async setTrackInstrument(track: number | string, instrument: InstrumentName) {
    const synth = await getSynth(instrument)
    this.synths[+track] = synth
  }

  isActiveHand(note: SongNote) {
    const { left, right } = this.songHands

    // Not even a L/R hand track.
    if (left !== note.track && right !== note.track) {
      return false
    }

    return (
      this.hand === 'both' ||
      (this.hand === 'left' && note.track === left) ||
      (this.hand === 'right' && note.track === right)
    )
  }

  /** Look up pre-computed hand for a note, falling back to index-based search. */
  getHandForNote(note: SongNote): 'left' | 'right' {
    // Try to find the note's index for map lookup
    const song = this.getSong()
    if (song) {
      // Binary search for the note's index
      const idx = findNoteIndex(song, note)
      if (idx >= 0 && this.handMap.has(idx)) {
        return this.handMap.get(idx)!
      }
    }
    // Absolute fallback (should rarely hit after pre-computation)
    return note.midiNote < 60 ? 'left' : 'right'
  }

  /** Look up pre-computed finger for a note. */
  getFingerForNote(note: SongNote): number {
    const song = this.getSong()
    if (song) {
      const idx = findNoteIndex(song, note)
      if (idx >= 0 && this.fingerMap.has(idx)) {
        return this.fingerMap.get(idx)!
      }
    }
    return 1 // absolute fallback
  }

  /** Return hit notes whose MIDI key is still physically pressed.
   *  midiNote returned is the transposed value (matching what the user pressed). */
  getHeldHitNotes(): Array<{ midiNote: number; hand: 'left' | 'right' }> {
    const result: Array<{ midiNote: number; hand: 'left' | 'right' }> = []
    for (const note of this.hitNotes) {
      const transposed = this.getTransposedMidi(note.midiNote)
      if (this.midiPressedNotes.has(transposed)) {
        result.push({ midiNote: transposed, hand: this.getHandForNote(note) })
      }
    }
    return result
  }

  /** Return notes currently waiting to be played, with hand and finger assignment.
   *  Used for wait-mode fingering display on piano keys.
   *  Includes both:
   *  1. Notes at playhead blocking wait mode (wait=true, currentIndex not advanced)
   *  2. Notes in lateNotes that have passed the play line (non-wait mode) */
  getWaitingNotes(): Array<{
    midiNote: number
    hand: 'left' | 'right'
    finger: number
    fingerLabel: string
  }> {
    const byHand = new Map<'left' | 'right', Array<{ midiNote: number; songNote: SongNote }>>()

    const song = this.getSong()

    // 1. Notes blocking wait mode at the playhead (currentIndex)
    //    These are the upcoming notes at the current song time.
    //    In wait mode, playLoop_ returns early so they never enter lateNotes.
    if (song && this.wait && this.currentIndex < song.notes.length) {
      const firstUpcoming = song.notes[this.currentIndex]
      if (firstUpcoming && !this.hitNotes.has(firstUpcoming)) {
        // Gather all notes at the same time (simultaneous notes)
        const notesAtTime: SongNote[] = []
        for (
          let i = this.currentIndex;
          i < song.notes.length &&
          song.notes[i].time < firstUpcoming.time + CHORD_WINDOW;
          i++
        ) {
          const n = song.notes[i]
          if (this.isActiveHand(n) && !this.hitNotes.has(n)) {
            notesAtTime.push(n)
          }
        }
        for (const n of notesAtTime) {
          const hand = this.getHandForNote(n)
          if (!byHand.has(hand)) {
            byHand.set(hand, [])
          }
          byHand.get(hand)!.push({
            midiNote: this.getTransposedMidi(n.midiNote),
            songNote: n,
          })
        }
      }
    }

    // 2. Late notes that have already passed the play line
    for (const [midiNote, songNote] of this.lateNotes.entries()) {
      const hand = this.getHandForNote(songNote)
      if (!byHand.has(hand)) {
        byHand.set(hand, [])
      }
      byHand.get(hand)!.push({ midiNote, songNote })
    }

    // Build result using pre-computed hand + finger maps
    const result: Array<{
      midiNote: number
      hand: 'left' | 'right'
      finger: number
      fingerLabel: string
    }> = []

    for (const [hand, notes] of byHand.entries()) {
      for (const entry of notes) {
        const finger = this.getFingerForNote(entry.songNote)
        const prefix = hand === 'right' ? 'R' : 'L'
        result.push({
          midiNote: entry.midiNote,
          hand,
          finger,
          fingerLabel: `${prefix}${finger}`,
        })
      }
    }

    return result
  }

  getTime() {
    const offset = 0 // getAudioContext().outputLatency
    const song = this.getSong()
    if (!song) {
      return 0
    }

    if (!this.isPlaying()) {
      return Math.max(0, this.currentSongTime - offset)
    }

    if (this.wait && !isHitNote(this, song.notes[this.currentIndex])) {
      return this.currentSongTime - offset
    }

    const now = performance.now()
    const dt = now - this.lastIntervalFiredTime
    return Math.max(0, this.currentSongTime + dt / 1000 - offset)
  }

  getBpm() {
    return this.currentBpm
  }

  increaseBpm() {
    const delta = 0.05
    this.store.set(this.bpmModifier, round(this.store.get(this.bpmModifier) + delta, 2))
  }

  decreaseBpm() {
    const delta = 0.05
    this.store.set(this.bpmModifier, round(this.store.get(this.bpmModifier) - delta, 2))
  }

  getBpmModifier() {
    return this.bpmModifier
  }

  getBpmModifierValue() {
    return this.store.get(this.bpmModifier)
  }

  setBpmModifier(value: number) {
    this.store.set(this.bpmModifier, round(value, 2))
  }

  setHand(hand: any) {
    this.hand = hand
  }

  getBpmIndexForTime(time: number) {
    const song = this.getSong()
    if (!song) {
      return 0
    }

    const index = song.bpms.findIndex((m) => m.time > time) - 1
    if (index < 0) {
      return song.bpms.length - 1
    }
    return index
  }

  getBpmForTime(time: number): number {
    const index = this.getBpmIndexForTime(time)
    const bpmModifier = this.store.get(this.bpmModifier)

    return (this.getSong()?.bpms[index]?.bpm ?? DEFAULT_BPM) * bpmModifier
  }

  getTimeSignatureForTime(time: number): { numerator: number; denominator: number } {
    const song = this.getSong()
    const timeSignatures = song?.timeSignatures

    if (timeSignatures && timeSignatures.length > 0) {
      const index = timeSignatures.findIndex((sig) => sig.time > time) - 1
      if (index >= 0) {
        return timeSignatures[index]
      }
      return timeSignatures[0] ?? DEFAULT_TIME_SIGNATURE
    }

    return song?.timeSignature ?? DEFAULT_TIME_SIGNATURE
  }

  getCountdownTimeReference_(time: number) {
    const song = this.getSong()
    if (!song) {
      return time
    }
    let index = song.measures.findIndex((m) => m.time > time) - 1
    if (index < 0) {
      index = song.measures.length - 1
    }
    const firstMeasure = song.measures[index]
    const secondMeasure = song.measures[index + 1]
    if (!firstMeasure || !secondMeasure) {
      return time
    }
    const isPickup = firstMeasure.duration < secondMeasure.duration * 0.75
    return isPickup ? secondMeasure.time : time
  }

  getMeasureForTime(time: number): SongMeasure {
    const song = this.getSong()
    if (!song) {
      return { type: 'measure', number: 0, duration: 0, time: 0 }
    }

    let index = song.measures.findIndex((m) => m.time > time) - 1
    if (index < 0) {
      index = song.measures.length - 1
    }
    return song.measures[index]
  }

  play() {
    const state = this.store.get(this.state)
    if (this.isPlaying() || state === 'CannotPlay' || state === 'CountingDown') {
      return
    }

    if (this.shouldCountdown()) {
      this.clearCountdown_()
      this.startCountdown_()
      return
    }

    this.startPlayback_()
  }

  cancelCountdown() {
    if (!this.isCountingDown()) {
      return
    }
    this.clearCountdown_(true)
    this.store.set(this.state, 'Paused')
  }

  startPlayback_() {
    this.store.set(this.countdownRemaining, 0)
    this.store.set(this.countdownTotal, 0)
    // If at the end of the song, restart it
    if (this.currentSongTime >= this.getDuration()) {
      this.seek(0)
    }
    this.store.set(this.state, 'Playing')

    this.lastIntervalFiredTime = performance.now()
    this.playInterval = setInterval(() => this.playLoop_(), 1)
    // continue playing everything we were in the middle of, but at a lower vol
    this.playing.forEach((note) => this.playNote(note))
  }

  playNote(note: SongNote) {
    const transposed = this.getTransposedMidi(note.midiNote)
    this.synths[note.track].playNote(transposed, note.velocity)
    // Send to MIDI output devices only when loopback is enabled
    if (this.store.get(loopbackEnabledAtom)) {
      midi.pressOutput(transposed, this.store.get(this.volume))
    }
  }

  stopNotes(notes: Array<SongNote>) {
    if (notes.length === 0 || this.synths.length === 0) {
      return
    }
    const loopback = this.store.get(loopbackEnabledAtom)
    for (let note of notes) {
      const transposed = this.getTransposedMidi(note.midiNote)
      this.synths[note.track].stopNote(transposed)
      if (loopback) {
        midi.releaseOutput(transposed)
      }
    }
  }

  updateTime_() {
    let dt = 0
    if (this.isPlaying()) {
      const now = performance.now()
      dt = (now - this.lastIntervalFiredTime) * this.store.get(this.bpmModifier)
      this.lastIntervalFiredTime = now
      this.currentSongTime += dt / 1000
    }

    return this.currentSongTime
  }

  playLoop_() {
    const song = this.getSong()
    if (!song) {
      return
    }

    const prevTime = this.currentSongTime
    let time = this.updateTime_()

    // If at the end of the song, stop playing.
    if (this.currentSongTime >= this.getDuration()) {
      this.seek(this.getDuration())
      this.pause()
    }

    // If a range is selected and you just got past it then zoom back
    const range = this.store.get(this.range)
    if (range) {
      let [start, stop] = range
      if (prevTime <= stop && stop <= time) {
        if (this.shouldCountdown(start)) {
          this.seek(start)
          this.pause()
          this.play()
        } else {
          this.seek(start)
        }
        return
      }
    }

    if (song.bpms[this.store.get(this.currentBpmIndex) + 1]?.time < time) {
      this.store.set(this.currentBpmIndex, increment)
    }
    const stillPlaying = (n: SongNote) => n.time + n.duration > time
    this.stopNotes(this.playing.filter((n) => !stillPlaying(n)))
    this.playing = this.playing.filter(stillPlaying)

    // Play metronome sounds
    const latestMetronomeTick = this.getLatestMetronomeTick(time)

    if (this.store.get(this.metronomeEnabled)) {
      if (this.metronomeLastPlayedTick !== latestMetronomeTick) {
        this.metronomeLastPlayedTick = latestMetronomeTick
        const metronomeVolume = this.store.get(this.metronomeVolume)
        if (metronomeVolume > 0) {
          this.metronomeSynth.playNote(
            this.isMetronomeTickAccented(latestMetronomeTick) ? 90 : 75,
            metronomeVolume * 127,
          )
        }
      }
    }

    // Update scoring details
    this.clearMissedNotes_()
    const heldNotes = this.playing.filter(
      (n) => this.midiPressedNotes.has(this.getTransposedMidi(n.midiNote)) && this.hitNotes.has(n),
    ).length
    if (heldNotes > 0) {
      this.store.set(this.score.durationHeld, (duration) => duration + heldNotes)
    }

    while (song.notes[this.currentIndex]?.time < time) {
      const note = song.notes[this.currentIndex]

      if (this.isActiveHand(note)) {
        if (this.wait && !this.hitNotes.has(note)) {
          // Wait mode: gather all notes within chord window
          const chordNotes: SongNote[] = []
          for (
            let i = this.currentIndex;
            i < song.notes.length &&
            song.notes[i].time < note.time + CHORD_WINDOW;
            i++
          ) {
            const n = song.notes[i]
            if (this.isActiveHand(n)) {
              chordNotes.push(n)
            }
          }

          // Check if ALL chord notes are hit
          const allHit = chordNotes.every((n) => this.hitNotes.has(n))

          if (allHit) {
            // All notes in chord hit — advance past them
            for (const n of chordNotes) {
              if (!this.hitNotes.has(n)) continue
              this.playing.push(n)
              if (
                !this.skipMissedNotes ||
                !this.isActiveHand(n) ||
                isHitNote(this, n)
              ) {
                this.playNote(n)
              }
              this.currentIndex++
            }
            // Update time past the chord
            this.currentSongTime = chordNotes[chordNotes.length - 1].time + 0.001
            continue
          }

          // Some notes still waiting — freeze at first note's time
          this.currentSongTime = note.time
          return
        } else if (!this.hitNotes.has(note) && prevTime < note.time) {
          // Only mark as late during the tick in which it is first played.
          this.lateNotes.set(this.getTransposedMidi(note.midiNote), note)
        }
      }
      this.playing.push(note)
      if (!this.skipMissedNotes || !this.isActiveHand(note) || isHitNote(this, note)) {
        this.playNote(note)
      }
      this.currentIndex++
    }
  }

  getLatestMetronomeTick(time: number) {
    const song = this.getSong()
    if (!song) {
      return 0
    }

    const ticksPerBeat = song.ppq * (4 / (song.timeSignature?.denominator ?? 4))
    const ticksPerMetronome = ticksPerBeat / this.store.get(this.metronomeSpeed)
    const currentTick = song.secondsToTicks(time)

    return Math.trunc(currentTick / ticksPerMetronome) * ticksPerMetronome
  }

  isMetronomeTickAccented(tick: number) {
    const song = this.getSong()
    if (!song) {
      return false
    }
    const beatsPerMeasure = song.timeSignature?.numerator ?? 4
    const ticksPerBeat = song.ppq * (4 / (song.timeSignature?.denominator ?? 4))

    return (
      this.store.get(this.metronomeEmphasizeFirst) && (tick / ticksPerBeat) % beatsPerMeasure === 0
    )
  }

  toggle() {
    if (this.isPlaying() || this.isCountingDown()) {
      this.pause()
      return
    }
    this.play()
  }

  stopAllSounds() {
    this.stopNotes(this.playing)
  }

  pause() {
    this.clearCountdown_(true)
    if (this.isCountingDown()) {
      this.store.set(this.state, 'Paused')
      return
    }
    if (!this.isPlaying()) {
      return
    }
    this.store.set(this.state, 'Paused')
    clearInterval(this.playInterval)
    this.playInterval = null
    this.stopAllSounds()
  }

  restart() {
    const range = this.store.get(this.range)
    if (range == null) {
      this.stop()
      return
    }
    const [start, _end] = range
    this.pause()
    this.seek(start)
    this.resetStats_()
  }

  stop() {
    this.pause()
    this.reset_()
  }

  reset_() {
    this.clearCountdown_(true)
    this.currentSongTime = 0
    this.currentIndex = 0
    this.playing = []
    this.lateNotes.clear()
    this.store.set(this.range, null)
    this.resetStats_()
  }

  resetStats_() {
    this.hitNotes.clear()
    this.missedNotes.clear()
    this.store.set(this.score.good, 0)
    this.store.set(this.score.missed, 0)
    this.store.set(this.score.perfect, 0)
    this.store.set(this.score.error, 0)
    this.store.set(this.score.durationHeld, 0)
    this.store.set(this.score.streak, 0)
  }

  resetMetronome() {
    this.store.set(this.metronomeVolume, 0.6)
    this.store.set(this.metronomeEnabled, false)
    this.store.set(this.metronomeSpeed, 1)
    this.store.set(this.metronomeEmphasizeFirst, true)
  }

  applyMetronomeConfig(metronome: SongConfig['metronome']) {
    this.store.set(this.metronomeEnabled, metronome.enabled)
    this.store.set(this.metronomeVolume, metronome.volume)
    this.store.set(this.metronomeSpeed, metronome.speed)
    this.store.set(this.metronomeEmphasizeFirst, metronome.emphasizeFirst)
  }

  applyCountdownConfig(enabled: boolean) {
    if (!enabled && this.isCountingDown()) {
      this.clearCountdown_(true)
      this.startPlayback_()
    }
    this.store.set(this.countdownEnabled, enabled)
  }

  applyTransposeConfig(semitones: number) {
    this.store.set(this.transpose, semitones)
  }

  getTransposedMidi(midiNote: number) {
    return transposeMidi(midiNote, this.store.get(this.transpose))
  }

  shouldCountdown(timeOverride?: number) {
    if (!this.store.get(this.countdownEnabled)) {
      return false
    }
    const time = timeOverride ?? this.getTime()
    const roundedTime = Math.round(time * 1000) / 1000
    if (roundedTime <= 0) {
      return true
    }
    const range = this.store.get(this.range)
    if (!range) {
      return false
    }
    return Math.abs(roundedTime - range[0]) < 0.001
  }

  getCountdownConfig_(time: number) {
    const referenceTime = this.getCountdownTimeReference_(time)

    let { numerator, denominator } = this.getTimeSignatureForTime(referenceTime)
    numerator = Math.max(Math.round(numerator), 1)
    denominator = denominator > 0 ? denominator : DEFAULT_TIME_SIGNATURE.denominator

    const bpm = Math.max(this.getBpmForTime(referenceTime), 1)

    const beatSeconds = (60 / bpm) * (4 / denominator)
    return { total: numerator, intervalMs: Math.max(1, beatSeconds * 1000) }
  }

  startCountdown_() {
    this.clearCountdown_()
    this.store.set(this.state, 'CountingDown')
    const { total, intervalMs } = this.getCountdownConfig_(this.getTime())
    if (total <= 0) {
      this.startPlayback_()
      return
    }
    this.store.set(this.countdownTotal, total)
    this.store.set(this.countdownRemaining, total)
    const volume = Math.max(0, this.store.get(this.metronomeVolume))
    const velocity = Math.min(127, Math.round(volume * 127))
    const playTick = () => {
      if (velocity > 0) {
        this.metronomeSynth.playNote(75, velocity)
      }
    }
    playTick()
    this.countdownInterval = setInterval(() => {
      const nextRemaining = Math.max(0, this.store.get(this.countdownRemaining) - 1)
      this.store.set(this.countdownRemaining, nextRemaining)
      if (nextRemaining > 0) {
        playTick()
        return
      }
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval)
        this.countdownInterval = null
      }
      if (this.isCountingDown()) {
        this.startPlayback_()
      }
    }, intervalMs)
  }

  clearCountdown_(resetRemaining = false) {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }
    if (resetRemaining) {
      this.store.set(this.countdownRemaining, 0)
      this.store.set(this.countdownTotal, 0)
    }
  }

  seek(time: number) {
    const song = this.getSong()
    if (!song) {
      return
    }

    const range = this.store.get(this.range)
    if (range) {
      const [start, stop] = range
      time = clamp(time, { min: start, max: stop })
    }

    this.stopAllSounds()
    this.currentSongTime = time
    this.playing = song.notes.filter((note) => {
      return note.time < this.currentSongTime && this.currentSongTime < note.time + note.duration
    })
    this.currentIndex = song.notes.findIndex((note) => note.time >= this.currentSongTime)
    this.store.set(this.currentBpmIndex, this.getBpmIndexForTime(time))

    this.metronomeLastPlayedTick = this.getLatestMetronomeTick(time)
    if (this.metronomeLastPlayedTick == song.secondsToTicks(time)) {
      this.metronomeLastPlayedTick--
    }

    this.missedNotes.clear()
    this.hitNotes.clear()
    this.lateNotes.clear()
  }

  /* Convert between songtime and real human time. Includes bpm calculations*/
  getRealTimeDuration(starttime: number, endtime: number) {
    return endtime - starttime
  }

  getDuration() {
    return this.store.get(this.song)?.duration ?? 0
  }

  setRange(range?: { start: number; end: number }) {
    if (!range) {
      this.store.set(this.range, null)
      return
    }

    const { start, end } = range

    const snappedStart = this.getMeasureForTime(start).time
    const endMeasure = this.getMeasureForTime(end)
    const snappedEnd =
      end <= endMeasure.time + 0.005
        ? endMeasure.time
        : (this.getNextMeasureTime(end) ?? this.getDuration())

    if (snappedEnd > snappedStart) {
      this.store.set(this.range, [snappedStart, snappedEnd])
      this.seek(this.getTime())
    }
  }

  getRange() {
    return this.range
  }

  getPreviousMeasureTime(time: number) {
    const currMeasure = this.getMeasureForTime(time)
    if (currMeasure.number > 1) {
      if (currMeasure.time === time) {
        // This assumes the measures are always in sorted order by time
        const currMeasureIdx = currMeasure.number - 1
        const prevMeasure = this.getSong()?.measures[currMeasureIdx - 1]
        if (prevMeasure) {
          return prevMeasure.time
        }
      } else {
        return currMeasure.time
      }
    }
  }

  getNextMeasureTime(time: number) {
    const song = this.getSong()
    if (!song) {
      return
    }

    const currMeasure = this.getMeasureForTime(time)
    const currMeasureIdx = currMeasure.number - 1
    if (currMeasureIdx < song.measures.length - 1) {
      const nextMeasure = song.measures[currMeasureIdx + 1]
      return nextMeasure.time
    } else if (currMeasure.time < song.duration) {
      return song.duration
    }
  }

  /**
   * Seeks to previous measure:
   * - If in the middle of a measure, seek to the start of the current measure.
   * - If at the start of a measure, seek to the previous one
   */
  seekToPreviousMeasure() {
    const prevMeasureTime = this.getPreviousMeasureTime(this.getTime())
    if (prevMeasureTime !== undefined) {
      this.seek(prevMeasureTime)
    }
  }

  /**
   * Seeks to the next measure's start if not at the last measure.
   */
  seekToNextMeasure() {
    const nextMeasureTime = this.getNextMeasureTime(this.getTime())
    if (nextMeasureTime !== undefined) {
      this.seek(nextMeasureTime)
    }
  }
}

export function isHitNote(player: Player, note?: SongNote) {
  if (!note) return false
  return player.hitNotes.has(note)
}

export function isMissedNote(player: Player, note?: SongNote) {
  if (!note) return false
  return player.missedNotes.has(note)
}
