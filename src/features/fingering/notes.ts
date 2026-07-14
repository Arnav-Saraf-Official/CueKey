/**
 * Piano Fingering Engine — Note Parser
 *
 * Converts SongNote objects (from the existing MIDI parser) into immutable
 * RichNote objects. This is the only module that touches the original SongNote
 * type — everything downstream works with RichNote exclusively.
 */

import type { SongNote } from '@/types'
import type { RichNote } from './types'

/** Pitch class → step letter. Index 0 = C. */
const STEP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Pitch class → alteration (-1 = flat, 0 = natural, 1 = sharp). */
const ALTERATIONS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

/** Pitch classes that are black keys on a piano. */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10])

/**
 * Determine if a MIDI note number represents a black key.
 * Pattern: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
 * Black keys are at positions 1, 3, 6, 8, 10 (the sharps/flats).
 */
export function isBlackKey(midiNote: number): boolean {
  return BLACK_KEYS.has(midiNote % 12)
}

/**
 * Convert a MIDI note number to its octave.
 * Middle C (MIDI 60) is in octave 4.
 */
export function midiToOctave(midiNote: number): number {
  return Math.floor(midiNote / 12) - 1
}

/**
 * Extract the pitch class (0–11) from a MIDI note number.
 * 0 = C, 1 = C#, ..., 11 = B.
 */
export function midiToPitchClass(midiNote: number): number {
  return midiNote % 12
}

/**
 * Parse a single SongNote into an immutable RichNote.
 */
export function parseNote(songNote: SongNote, index: number): RichNote {
  const pitchClass = midiToPitchClass(songNote.midiNote)
  const black = isBlackKey(songNote.midiNote)

  return Object.freeze({
    index,
    midiNote: songNote.midiNote,
    pitchClass,
    octave: midiToOctave(songNote.midiNote),
    startTime: songNote.time,
    endTime: songNote.time + songNote.duration,
    duration: songNote.duration,
    velocity: songNote.velocity ?? 64,
    track: songNote.track,
    measure: songNote.measure,
    isBlackKey: black,
    isWhiteKey: !black,
    step: STEP_NAMES[pitchClass]![0]!,
    alter: ALTERATIONS[pitchClass]!,
  })
}

/**
 * Parse all notes in a song into immutable RichNote objects.
 * Returns a new array — the original Song.notes is not modified.
 */
export function parseNotes(notes: readonly SongNote[]): RichNote[] {
  return notes.map((n, i) => parseNote(n, i))
}
