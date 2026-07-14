/**
 * Piano Fingering Engine — Context Analysis
 *
 * For every RichNote, computes musical context:
 *   - Previous/next note, melodic interval, rhythmic spacing
 *   - Direction of motion, chord membership, repeated notes
 *   - Phrase boundaries, local density
 *
 * All results are cached — each note is processed once and the output
 * is immutable AnalyzedNote objects.
 */

import type { RichNote, AnalyzedNote, PatternTag, MelodicDirection } from './types'
import type { FingeringConfig } from './config'

/**
 * Build analyzed note objects from a sequence of rich notes.
 *
 * @param notes - All notes in the song (across all tracks, in time order)
 * @param config - Engine configuration for threshold values
 * @returns Analyzed notes in the same order as input
 */
export function analyzeContext(
  notes: readonly RichNote[],
  config: FingeringConfig,
): AnalyzedNote[] {
  const n = notes.length

  // Precompute chord groupings: notes within chordWindow are simultaneous
  const chordGroups = buildChordGroups(notes, config.chordWindow)

  // Compute local density for each note
  const densities = computeLocalDensity(notes)

  // Detect phrase boundaries
  const phraseBoundaries = detectPhraseBoundaries(notes, config)

  const result: AnalyzedNote[] = []

  for (let i = 0; i < n; i++) {
    const note = notes[i]!

    // Previous and next notes (non-chord neighbors)
    const prevNote = i > 0 ? notes[i - 1]! : null
    const nextNote = i < n - 1 ? notes[i + 1]! : null

    // Melodic interval
    const melodicInterval = prevNote ? note.midiNote - prevNote.midiNote : null

    // Direction
    const direction = computeDirection(melodicInterval)

    // Rhythmic spacing
    const rhythmicSpacing = prevNote ? note.startTime - prevNote.startTime : null

    // Chord membership
    const chordNotes = chordGroups.get(i) ?? [note]
    const isChordNote = chordNotes.length > 1

    // Repeated notes
    const isRepeated = prevNote !== null && note.midiNote === prevNote.midiNote &&
      (note.startTime - prevNote.startTime) <= config.repeatedNoteTimeWindow

    // Phrase boundaries
    const isPhraseStart = phraseBoundaries.has(i)
    const isPhraseEnd = i < n - 1 ? phraseBoundaries.has(i + 1) : true

    // Local density
    const localDensity = densities[i]!

    // Pattern tags are filled in later by the pattern recognizer — start empty
    const patternTags: PatternTag[] = []

    result.push({
      note,
      previousNote: prevNote,
      nextNote,
      melodicInterval,
      rhythmicSpacing,
      direction,
      isChordNote,
      chordNotes: Object.freeze(chordNotes),
      isRepeated,
      patternTags,
      patternSpan: null,
      patternMinNote: null,
      isPhraseStart,
      isPhraseEnd,
      localDensity,
    })
  }

  return result
}

// ─── Chord Grouping ─────────────────────────────────────────────────

/**
 * Group notes that fall within `chordWindow` seconds of each other.
 * Returns a map from note index → array of simultaneous notes.
 */
function buildChordGroups(
  notes: readonly RichNote[],
  chordWindow: number,
): Map<number, RichNote[]> {
  const groups = new Map<number, RichNote[]>()

  let sliceStart = 0
  for (let i = 1; i <= notes.length; i++) {
    if (i === notes.length || notes[i]!.startTime - notes[sliceStart]!.startTime >= chordWindow) {
      // Found a slice boundary
      const sliceNotes = notes.slice(sliceStart, i)
      for (let j = sliceStart; j < i; j++) {
        groups.set(j, sliceNotes)
      }
      sliceStart = i
    }
  }

  return groups
}

// ─── Local Density ──────────────────────────────────────────────────

/**
 * Compute how many notes per second occur in a ~1-second window
 * around each note. Higher density → more rapid passage → may influence
 * fingering (e.g., favor stronger fingers, avoid 4).
 */
function computeLocalDensity(notes: readonly RichNote[]): number[] {
  const densities: number[] = []
  const windowSec = 1.0

  for (let i = 0; i < notes.length; i++) {
    const center = notes[i]!.startTime
    const windowStart = center - windowSec / 2
    const windowEnd = center + windowSec / 2

    // Count notes in window
    let count = 0
    for (let j = i; j >= 0 && notes[j]!.startTime >= windowStart; j--) count++
    for (let j = i + 1; j < notes.length && notes[j]!.startTime <= windowEnd; j++) count++

    densities.push(count / windowSec)
  }

  return densities
}

// ─── Direction ──────────────────────────────────────────────────────

function computeDirection(interval: number | null): MelodicDirection {
  if (interval === null || interval === 0) return 'same'
  return interval > 0 ? 'up' : 'down'
}

// ─── Phrase Boundaries ──────────────────────────────────────────────

/**
 * Detect phrase boundaries based on rests (gaps between notes).
 * A gap larger than phraseBoundaryMinRest marks a phrase boundary.
 * Very short phrases (< phraseBoundaryMinLength notes) are merged.
 */
function detectPhraseBoundaries(
  notes: readonly RichNote[],
  config: FingeringConfig,
): Set<number> {
  const boundaries = new Set<number>()
  boundaries.add(0) // Start of song is always a phrase boundary

  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i]!.startTime - notes[i - 1]!.endTime
    if (gap >= config.phraseBoundaryMinRest) {
      boundaries.add(i)
    }
  }

  return boundaries
}
