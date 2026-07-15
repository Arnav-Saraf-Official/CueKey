/**
 * Piano Fingering Engine — Main Entry Point
 *
 * Replaces the existing simple heuristic fingering system with a
 * global optimization approach using Dynamic Programming (Viterbi)
 * with beam search.
 *
 * Usage:
 *   import { computeFingering } from '@/features/fingering'
 *   const result = computeFingering(song, songHands, config?)
 *
 * The returned { handMap, fingerMap } is API-compatible with the
 * existing Player's expectations for drop-in replacement.
 */

import type { Song, SongNote } from '@/types'
import type {
  Finger,
  Hand,
  AnalyzedNote,
  FingeringResult,
  FingeringStats,
  FingerDecision,
} from './types'
import type { FingeringConfig } from './config'
import { DEFAULT_CONFIG } from './config'
import { parseNotes } from './notes'
import { analyzeContext } from './context'
import { recognizePatterns } from './patterns'
import { optimizeHand } from './optimizer'
import { debugFingerDecision } from './debug'

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Compute hand and finger assignments for all notes in a song.
 *
 * This is the main entry point. It replaces the old `computeHandAndFingerMaps`
 * function in player.ts with the new global-optimization approach.
 *
 * @param song - The parsed song with notes in time order
 * @param songHands - Track IDs for left and right hands
 * @param config - Optional configuration overrides (merges with defaults)
 * @returns Hand and finger maps compatible with Player's existing interface
 */
export function computeFingering(
  song: Song,
  songHands: { left?: number; right?: number },
  config?: Partial<FingeringConfig>,
): FingeringResult {
  const startTime = performance.now()
  const mergedConfig: FingeringConfig = { ...DEFAULT_CONFIG, ...config }

  // Phase 1: Parse notes into immutable RichNote objects
  const richNotes = parseNotes(song.notes)

  // Phase 2: Context analysis
  const analyzedNotes = analyzeContext(richNotes, mergedConfig)

  // Phase 3: Pattern recognition (annotates notes in place)
  recognizePatterns(analyzedNotes, mergedConfig)

  // Phase 4: Split notes by hand
  const { leftNotes, rightNotes } = splitByHand(analyzedNotes, song, songHands, mergedConfig)

  // Phase 5: Optimize each hand independently
  const leftFingerMap = optimizeHand(leftNotes, 'left', mergedConfig)
  const rightFingerMap = optimizeHand(rightNotes, 'right', mergedConfig)

  // Phase 6: Build hand map and merge finger maps
  const handMap = new Map<number, Hand>()
  const fingerMap = new Map<number, Finger>()

  for (const note of leftNotes) {
    handMap.set(note.note.index, 'left')
  }
  for (const note of rightNotes) {
    handMap.set(note.note.index, 'right')
  }

  for (const [idx, finger] of leftFingerMap) {
    fingerMap.set(idx, finger)
  }
  for (const [idx, finger] of rightFingerMap) {
    fingerMap.set(idx, finger)
  }

  // Phase 7: Debug info (if enabled)
  let decisions: FingerDecision[] = []
  if (mergedConfig.enableDebug) {
    decisions = generateDebugDecisions(
      leftNotes, rightNotes, leftFingerMap, rightFingerMap, mergedConfig,
    )
  }

  // Statistics
  const stats = computeStats(analyzedNotes, leftNotes, rightNotes, startTime, mergedConfig)

  return { handMap, fingerMap, decisions, stats }
}

// ─── Hand Splitting ─────────────────────────────────────────────────

/**
 * Split analyzed notes into left and right hand groups.
 *
 * Uses the same multi-track / single-track logic as the original
 * `computeHandAndFingerMaps` for backward compatibility, but returns
 * AnalyzedNote arrays for the optimizer to consume.
 */
function splitByHand(
  analyzed: readonly AnalyzedNote[],
  song: Song,
  songHands: { left?: number; right?: number },
  config: FingeringConfig,
): { leftNotes: AnalyzedNote[]; rightNotes: AnalyzedNote[] } {
  const leftNotes: AnalyzedNote[] = []
  const rightNotes: AnalyzedNote[] = []

  const isSingleTrack = songHands.left === undefined || songHands.right === undefined ||
    songHands.left === songHands.right

  // Track-based splitting
  if (!isSingleTrack) {
    for (const an of analyzed) {
      const track = an.note.track
      if (track === songHands.left) {
        leftNotes.push(an)
      } else if (track === songHands.right) {
        rightNotes.push(an)
      } else {
        // Unknown track: assign by pitch
        if (an.note.midiNote < 60) {
          leftNotes.push(an)
        } else {
          rightNotes.push(an)
        }
      }
    }
    return { leftNotes, rightNotes }
  }

  // Single-track: split by time slices with continuity
  // Group into slices first
  const slices = buildSlices(analyzed, config.chordWindow)

  // For each slice, determine hand
  const sliceHands: Array<'left' | 'right' | 'split'> = []

  for (const slice of slices) {
    if (slice.length === 1) {
      sliceHands.push('left') // placeholder, fixed by continuity
      continue
    }

    // Multi-note slice: split at largest pitch gap
    const sortedMidis = slice.map((a) => a.note.midiNote).sort((a, b) => a - b)
    let maxGap = 0
    let splitAt = 60
    for (let i = 0; i < sortedMidis.length - 1; i++) {
      const gap = sortedMidis[i + 1]! - sortedMidis[i]!
      if (gap > maxGap) {
        maxGap = gap
        splitAt = sortedMidis[i]! + Math.floor(gap / 2)
      }
    }

    if (maxGap > 4) {
      sliceHands.push('split')
      // Store split point
      ;(slice as any)._splitAt = splitAt
    } else {
      const avg = sortedMidis.reduce((a, b) => a + b, 0) / sortedMidis.length
      sliceHands.push(avg < 60 ? 'left' : 'right')
    }
  }

  // Continuity pass for single-note slices
  for (let s = 0; s < slices.length; s++) {
    if (sliceHands[s] !== 'left' || slices[s]!.length > 1) continue

    let prevHand: 'left' | 'right' | null = null
    let nextHand: 'left' | 'right' | null = null

    for (let p = s - 1; p >= 0 && prevHand === null; p--) {
      const h = sliceHands[p]
      if (h === 'left' || h === 'right') prevHand = h as 'left' | 'right'
      else if (h === 'split') prevHand = null
    }
    for (let n = s + 1; n < slices.length && nextHand === null; n++) {
      const h = sliceHands[n]
      if (h === 'left' || h === 'right') nextHand = h as 'left' | 'right'
      else if (h === 'split') nextHand = null
    }

    const pitch = slices[s]![0]!.note.midiNote
    if (prevHand && nextHand && prevHand === nextHand) {
      sliceHands[s] = prevHand
    } else if (prevHand) {
      sliceHands[s] = prevHand
    } else if (nextHand) {
      sliceHands[s] = nextHand
    } else {
      sliceHands[s] = pitch < 60 ? 'left' : 'right'
    }
  }

  // Assign notes to hands
  for (let s = 0; s < slices.length; s++) {
    const slice = slices[s]!
    const hand = sliceHands[s]!

    if (hand === 'split') {
      const splitAt = (slice as any)._splitAt ?? 60
      for (const an of slice) {
        if (an.note.midiNote < splitAt) {
          leftNotes.push(an)
        } else {
          rightNotes.push(an)
        }
      }
    } else if (hand === 'left') {
      for (const an of slice) leftNotes.push(an)
    } else {
      for (const an of slice) rightNotes.push(an)
    }
  }

  return { leftNotes, rightNotes }
}

/**
 * Group notes into time slices for hand splitting.
 */
function buildSlices(
  notes: readonly AnalyzedNote[],
  chordWindow: number,
): AnalyzedNote[][] {
  const slices: AnalyzedNote[][] = []
  let i = 0
  while (i < notes.length) {
    const startTime = notes[i]!.note.startTime
    const slice: AnalyzedNote[] = []
    while (i < notes.length && notes[i]!.note.startTime - startTime < chordWindow) {
      slice.push(notes[i]!)
      i++
    }
    slices.push(slice)
  }
  return slices
}

// ─── Debug Info Generation ──────────────────────────────────────────

function generateDebugDecisions(
  leftNotes: readonly AnalyzedNote[],
  rightNotes: readonly AnalyzedNote[],
  leftFingerMap: ReadonlyMap<number, Finger>,
  rightFingerMap: ReadonlyMap<number, Finger>,
  config: FingeringConfig,
): FingerDecision[] {
  const decisions: FingerDecision[] = []

  for (const note of leftNotes) {
    const finger = leftFingerMap.get(note.note.index)
    if (finger === undefined) continue
    const prevNote = note.previousNote
      ? leftNotes.find((n) => n.note.index === note.previousNote!.index) ?? null
      : null
    const prevFinger = prevNote
      ? (leftFingerMap.get(prevNote.note.index) ?? null)
      : null

    decisions.push(debugFingerDecision(
      note, finger, 'left', note.note.midiNote,
      prevFinger, prevNote, null, config,
    ))
  }

  for (const note of rightNotes) {
    const finger = rightFingerMap.get(note.note.index)
    if (finger === undefined) continue
    const prevNote = note.previousNote
      ? rightNotes.find((n) => n.note.index === note.previousNote!.index) ?? null
      : null
    const prevFinger = prevNote
      ? (rightFingerMap.get(prevNote.note.index) ?? null)
      : null

    decisions.push(debugFingerDecision(
      note, finger, 'right', note.note.midiNote,
      prevFinger, prevNote, null, config,
    ))
  }

  return decisions
}

// ─── Statistics ─────────────────────────────────────────────────────

function computeStats(
  allNotes: readonly AnalyzedNote[],
  leftNotes: readonly AnalyzedNote[],
  rightNotes: readonly AnalyzedNote[],
  startTime: number,
  config: FingeringConfig,
): FingeringStats {
  const chordCount = allNotes.filter((n) => n.isChordNote).length
  const patternCounts: Record<string, number> = {}

  for (const note of allNotes) {
    for (const tag of note.patternTags) {
      patternCounts[tag] = (patternCounts[tag] ?? 0) + 1
    }
  }

  // Count phrases
  const phraseStarts = allNotes.filter((n) => n.isPhraseStart).length

  return {
    totalNotes: allNotes.length,
    totalChords: chordCount,
    totalPhrases: phraseStarts,
    avgCostPerNote: 0, // computed from decisions when debug is on
    optimizationTimeMs: performance.now() - startTime,
    patternCounts,
  }
}

// ─── Re-exports ─────────────────────────────────────────────────────

export { DEFAULT_CONFIG } from './config'
export { parseNotes } from './notes'
export { analyzeContext } from './context'
export { recognizePatterns } from './patterns'
export { optimizeHand, optimizeFingering } from './optimizer'
export { generateChordCandidates } from './chord-optimizer'
export { computeTransitionCost, evaluateChordFingering } from './costs'
export { debugFingerDecision, formatDebugReport } from './debug'
export type {
  Finger,
  Hand,
  RichNote,
  AnalyzedNote,
  PatternTag,
  TimeSlice,
  HandState,
  ViterbiState,
  FingerDecision,
  FingerCandidate,
  FingeringResult,
  FingeringStats,
  ChordCandidate,
  CostBreakdown,
} from './types'
export type { FingeringConfig } from './config'
export type { CostContext } from './costs'
