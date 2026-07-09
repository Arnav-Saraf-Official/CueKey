// TODO: handle when users don't have an AudioContext supporting browser
import { getSynthStub, InstrumentName } from '@/features/synth'
import { transposeMidi } from '@/features/theory'
import { MidiStateEvent, Song, SongConfig, SongMeasure, SongNote } from '@/types'
import { clamp, getHands, round } from '@/utils'
import { atom, Atom, getDefaultStore, PrimitiveAtom } from 'jotai'
import midi from '../midi'
import { getSynth, Synth } from '../synth'

function increment(x: number) {
  return x + 1
}

/** Assign finger numbers (1-5) for N simultaneous notes, low→high.
 *  Uses standard piano chord fingering based on intervals between notes.
 *  Triads: root pos=1-3-5, 1st inv=1-2-5, 2nd inv=1-3-5.
 *  Skips fingers proportionally to pitch gaps. */
function assignFingers(midiNotes: number[]): number[] {
  const n = midiNotes.length
  if (n <= 0) return []
  if (n === 1) return [1]

  // Sort low→high (should already be sorted)
  const sorted = [...midiNotes].sort((a, b) => a - b)

  // Compute adjacent intervals in semitones
  const intervals: number[] = []
  for (let i = 0; i < n - 1; i++) {
    intervals.push(sorted[i + 1] - sorted[i])
  }
  const totalSpan = sorted[n - 1] - sorted[0]

  if (n === 2) {
    // 2 notes: 1-2 for small interval, 1-3 for 3rd, 1-4 for 4th, 1-5 for 5th+
    const gap = intervals[0]
    if (gap <= 2) return [1, 2]
    if (gap <= 4) return [1, 3]
    if (gap <= 5) return [1, 4]
    return [1, 5]
  }

  if (n === 3) {
    // Triad detection: check if it's a root, 1st inv, or 2nd inv pattern
    const [i1, i2] = intervals
    // Root position: bottom 3rd (3-4 semitones), top 3rd (3-4) → 1-3-5
    if (i1 >= 3 && i1 <= 4 && i2 >= 3 && i2 <= 4) return [1, 3, 5]
    // 1st inversion: bottom 4th (5 semitones), top 3rd → 1-2-5
    if (i1 >= 5 && i1 <= 6 && i2 >= 3 && i2 <= 4) return [1, 2, 5]
    // 2nd inversion: bottom 3rd, top 4th → 1-3-5
    if (i1 >= 3 && i1 <= 4 && i2 >= 5 && i2 <= 6) return [1, 3, 5]
    // Wide spread: 1-2-5 for large total span
    if (totalSpan > 7) return [1, 2, 5]
    // Close cluster: 1-2-3
    if (totalSpan <= 4) return [1, 2, 3]
    // Default triad
    return [1, 3, 5]
  }

  if (n === 4) {
    // 4-note chords: 1-2-3-5 (dominant 7th style) or 1-2-3-4 (cluster)
    if (totalSpan >= 7) return [1, 2, 3, 5]
    if (totalSpan <= 5) return [1, 2, 3, 4]
    return [1, 2, 4, 5]
  }

  // 5+ notes: fill the hand
  if (n === 5) return [1, 2, 3, 4, 5]
  // More than 5: cap at 5, double some fingers (chord spanning both hands is rare)
  return Array.from({ length: n }, (_, i) => Math.min(i + 1, 5))
}

type JotaiStore = ReturnType<typeof getDefaultStore>
const GOOD_RANGE = 300
const PERFECT_RANGE = 50
/** Notes within this time window (seconds) are treated as simultaneous chord. */
const CHORD_WINDOW = 0.05
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

  /** Determine which hand a note belongs to based on track assignment.
   *  Falls back to algorithmic split when MIDI has only one track
   *  (both hands assigned to same track by parserInferHands). */
  getHandForNote(note: SongNote): 'left' | 'right' {
    const isSingleTrack = this.songHands.left === this.songHands.right

    if (!isSingleTrack) {
      if (note.track === this.songHands.left) return 'left'
      if (note.track === this.songHands.right) return 'right'
      return note.midiNote < 60 ? 'left' : 'right'
    }

    // Single-track MIDI: algorithmic hand split
    return this.splitHandByAlgorithm(note)
  }

  /** Algorithmic hand split for single-track MIDI.
   *  Groups simultaneous notes and splits at the largest pitch gap or at C4. */
  private splitHandByAlgorithm(note: SongNote): 'left' | 'right' {
    const song = this.getSong()
    if (!song) return note.midiNote < 60 ? 'left' : 'right'

    // Find all notes at the same time (simultaneous notes / chord)
    const simultaneous = song.notes.filter(
      (n) => Math.abs(n.time - note.time) < 0.005,
    )

    if (simultaneous.length <= 1) {
      // Single note: use C4 boundary with hysteresis
      return note.midiNote < 60 ? 'left' : 'right'
    }

    // Multiple notes at same time: split by largest pitch gap or C4
    const sorted = simultaneous.map((n) => n.midiNote).sort((a, b) => a - b)

    // Find the largest gap between adjacent notes
    let maxGap = 0
    let splitAt = 60 // default to C4
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1] - sorted[i]
      if (gap > maxGap) {
        maxGap = gap
        splitAt = sorted[i] + Math.floor(gap / 2)
      }
    }

    // Only use the gap split if it's significant (> 4 semitones)
    // Otherwise fall back to C4
    const threshold = maxGap > 4 ? splitAt : 60
    return note.midiNote < threshold ? 'left' : 'right'
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

    // Assign fingers per hand: sort by pitch, number 1-5 from low→high
    const result: Array<{
      midiNote: number
      hand: 'left' | 'right'
      finger: number
      fingerLabel: string
    }> = []

    for (const [hand, notes] of byHand.entries()) {
      // Sort by pitch (low→high), finger 1 on lowest note
      notes.sort((a, b) => a.midiNote - b.midiNote)

      const fingers = assignFingers(notes.map((n) => n.midiNote))
      const prefix = hand === 'right' ? 'R' : 'L'

      for (let i = 0; i < notes.length; i++) {
        result.push({
          midiNote: notes[i].midiNote,
          hand,
          finger: fingers[i],
          fingerLabel: `${prefix}${fingers[i]}`,
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
    this.synths[note.track].playNote(this.getTransposedMidi(note.midiNote), note.velocity)
  }

  stopNotes(notes: Array<SongNote>) {
    if (notes.length === 0 || this.synths.length === 0) {
      return
    }
    for (let note of notes) {
      this.synths[note.track].stopNote(this.getTransposedMidi(note.midiNote))
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
