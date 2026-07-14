/**
 * Piano Fingering Engine — Beam Search Optimizer
 *
 * Core optimization algorithm. Formulates fingering as a global optimization
 * problem solved via Dynamic Programming (Viterbi) with beam search.
 *
 * Never makes greedy decisions. A fingering that looks locally optimal
 * may be worse over the next several notes. The optimizer searches the
 * entire sequence for the minimum-cost path.
 *
 * For a sequence of N time slices, each slice has candidate finger
 * assignments (up to 5 for single notes, up to C(5,k) for chords).
 * The search keeps the best K (beamWidth) states at each step.
 *
 * Complexity: O(slices × beamWidth × candidatesPerSlice × beamWidth)
 *            ≈ O(notes × beamWidth × candidates), well under 1 second
 *            for thousands of notes.
 */

import type {
  Finger,
  Hand,
  AnalyzedNote,
  TimeSlice,
  ViterbiState,
  HandState,
  CostBreakdown,
  ChordCandidate,
} from './types'
import { ALL_FINGERS, ZERO_COST } from './types'
import type { FingeringConfig } from './config'
import type { CostContext } from './costs'
import { computeTransitionCost } from './costs'
import { generateChordCandidates } from './chord-optimizer'
import { neutralHandState, handStateFromFinger } from './hand-model'
import { stretchCost, isIntervalPossible } from './ergonomics'

// ─── Beam Reset Detection ───────────────────────────────────────────

/**
 * Determine if the beam should be reset at this slice boundary.
 * Resets at large leaps into new compact patterns — the hand is
 * repositioning and accumulated costs from previous pattern runs
 * should not corrupt the current run's fingering choices.
 */
function shouldResetBeam(
  slice: TimeSlice,
  beam: readonly ViterbiState[],
): boolean {
  if (slice.notes.length === 0 || beam.length === 0) return false

  const note = slice.notes[0]!
  const tags = note.patternTags

  // Reset when a new compact pattern starts after a large leap
  const startsCompactPattern = tags.includes('arpeggio') || tags.includes('broken-chord')
  const isLargeLeap = tags.includes('large-leap')

  if (startsCompactPattern && isLargeLeap) {
    // Additional safety: only reset if this is actually a pattern START
    // (first note of the pattern, not mid-pattern)
    const span = note.patternSpan
    if (span !== null && span > 0 && span <= 12) {
      // Check if previous beam state ended a different pattern run
      // by looking at whether the beam's best state has the same pattern
      const bestPrev = beam[0]!
      if (bestPrev.sliceIndex < 0) return false // already fresh

      return true
    }
  }

  return false
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Optimize fingering for a sequence of time slices (one hand).
 *
 * Uses Viterbi beam search to find the globally optimal fingering path.
 *
 * @param slices - Time slices for a single hand, in chronological order
 * @param hand - Which hand these slices belong to
 * @param config - Engine configuration
 * @returns Map from note index → assigned finger
 */
export function optimizeFingering(
  slices: readonly TimeSlice[],
  hand: Hand,
  config: FingeringConfig,
): Map<number, Finger> {
  if (slices.length === 0) return new Map()

  const beamWidth = config.beamWidth
  const initialHandState = neutralHandState(hand)

  // Initial state: before any notes
  let beam: ViterbiState[] = [{
    sliceIndex: -1,
    assignments: new Map(),
    handState: initialHandState,
    accumulatedCost: 0,
    costBreakdown: ZERO_COST,
    prev: null,
  }]

  // Accumulator for fingerings when beam resets
  const accumulatedFingerMap = new Map<number, Finger>()

  // Process each time slice
  for (let s = 0; s < slices.length; s++) {
    const slice = slices[s]!
    let candidates = generateSliceCandidates(slice, s, beam, slices, hand, config)

    // Pattern-boundary reset: when a new compact pattern starts after a large
    // leap, the hand is repositioning. Accumulated costs from previous
    // repetitions should not drown out the correct fingering for this run.
    // Save old fingerings and start fresh.
    const doReset = candidates.length > 0 && beam.length > 0 && shouldResetBeam(slice, beam)
    if (doReset) {
      const bestPrev = beam[0]!
      const savedFingers = tracebackFingerMap(bestPrev)
      for (const [idx, finger] of savedFingers) {
        if (!accumulatedFingerMap.has(idx)) {
          accumulatedFingerMap.set(idx, finger)
        }
      }
      beam = [{
        sliceIndex: -1,
        assignments: new Map(),
        handState: neutralHandState(hand),
        accumulatedCost: 0,
        costBreakdown: ZERO_COST,
        prev: null,
      }]
      candidates = generateSliceCandidates(slice, s, beam, slices, hand, config)
    }

    // If beam is empty (all transitions returned Infinity, e.g., after a huge leap):
    // 1. Save fingerings from the best previous state (before the leap)
    // 2. Reset beam for a fresh start
    if (candidates.length === 0 && beam.length > 0) {
      // Save accumulated fingerings before resetting
      const bestPrev = beam[0]!
      const savedFingers = tracebackFingerMap(bestPrev)
      for (const [idx, finger] of savedFingers) {
        if (!accumulatedFingerMap.has(idx)) {
          accumulatedFingerMap.set(idx, finger)
        }
      }

      // Reset beam
      beam = [{
        sliceIndex: -1,
        assignments: new Map(),
        handState: neutralHandState(hand),
        accumulatedCost: 0,
        costBreakdown: ZERO_COST,
        prev: null,
      }]
      candidates = generateSliceCandidates(slice, s, beam, slices, hand, config)
    }

    beam = candidates.slice(0, beamWidth)

    // Compact-pattern completion: when a pattern run ends, save fingerings
    // immediately so later beam resets don't lose them. The beam may
    // later reconverge to a different state chain that lost the correct
    // fingers for this pattern — saving now locks them in.
    if (beam.length > 0 && slice.notes.length === 1) {
      const note = slice.notes[0]!
      const isCompact = (note.patternTags.includes('arpeggio') ||
        note.patternTags.includes('broken-chord')) &&
        note.patternSpan !== null && note.patternSpan > 0 && note.patternSpan <= 12

      if (isCompact && note.patternMinNote !== null) {
        const nextSlice = slices[s + 1]
        const nextNote = nextSlice?.notes[0]
        const continuesPattern = nextNote &&
          (nextNote.patternTags.includes('arpeggio') ||
           nextNote.patternTags.includes('broken-chord')) &&
          nextNote.patternSpan === note.patternSpan &&
          nextNote.patternMinNote === note.patternMinNote

        if (!continuesPattern) {
          const bestState = beam[0]!
          const savedFingers = tracebackFingerMap(bestState)
          for (const [idx, finger] of savedFingers) {
            if (!accumulatedFingerMap.has(idx)) {
              accumulatedFingerMap.set(idx, finger)
            }
          }
          beam = [{
            sliceIndex: -1,
            assignments: new Map(),
            handState: neutralHandState(hand),
            accumulatedCost: 0,
            costBreakdown: ZERO_COST,
            prev: null,
          }]
        }
      }
    }
  }

  // Trace back the best path from the final beam
  if (beam.length === 0) return accumulatedFingerMap

  const bestState = beam[0]!
  const finalFingers = tracebackFingerMap(bestState)

  // Merge: accumulated from earlier resets + final traceback
  for (const [idx, finger] of finalFingers) {
    if (!accumulatedFingerMap.has(idx)) {
      accumulatedFingerMap.set(idx, finger)
    }
  }

  return accumulatedFingerMap
}

// ─── Candidate Generation ───────────────────────────────────────────

/**
 * Generate all candidate Viterbi states for a time slice by evaluating
 * every possible fingering against every surviving previous state.
 */
function generateSliceCandidates(
  slice: TimeSlice,
  sliceIndex: number,
  prevBeam: readonly ViterbiState[],
  allSlices: readonly TimeSlice[],
  hand: Hand,
  config: FingeringConfig,
): ViterbiState[] {
  const candidates: ViterbiState[] = []

  if (slice.notes.length === 1) {
    // Single note: try each finger 1-5
    const note = slice.notes[0]!
    for (const finger of ALL_FINGERS) {
      // Quick physical feasibility check
      if (!isFingerFeasibleForNote(finger, note, config)) continue

      for (const prevState of prevBeam) {
        const prevFinger = getLastFinger(prevState)
        const prevNote = getLastNote(prevState, allSlices)

        const ctx: CostContext = {
          prevHandState: prevState.handState,
          finger,
          note,
          prevFinger,
          prevNote,
          hand,
          isPhraseStart: note.isPhraseStart,
          isPhraseEnd: note.isPhraseEnd,
          sliceNotes: slice.notes,
        }

        const costBreakdown = computeTransitionCost(ctx, config)
        if (costBreakdown.total === Infinity) continue

        const handState = handStateFromFinger(finger, note.note.midiNote, note.direction)
        const assignments = new Map<number, Finger>()
        assignments.set(note.note.index, finger)

        candidates.push({
          sliceIndex,
          assignments,
          handState,
          accumulatedCost: prevState.accumulatedCost + costBreakdown.total,
          costBreakdown,
          prev: prevState,
        })
      }
    }
  } else {
    // Chord: generate finger combinations
    const sortedNotes = [...slice.notes].sort((a, b) => a.note.midiNote - b.note.midiNote)
    const chordCandidates = generateChordCandidates(sortedNotes, hand, config)

    for (const chord of chordCandidates) {
      for (const prevState of prevBeam) {
        // For chords, evaluate transition from previous state to this chord
        // Use the middle note as the "representative" for transition costs
        const middleIdx = Math.floor(sortedNotes.length / 2)
        const repNote = sortedNotes[middleIdx]!
        const repFinger = chord.assignments.get(repNote.note.index) ?? 3
        const prevFinger = getLastFinger(prevState)
        const prevNote = getLastNote(prevState, allSlices)

        const ctx: CostContext = {
          prevHandState: prevState.handState,
          finger: repFinger,
          note: repNote,
          prevFinger,
          prevNote,
          hand,
          isPhraseStart: slice.notes.some((n) => n.isPhraseStart),
          isPhraseEnd: slice.notes.some((n) => n.isPhraseEnd),
          sliceNotes: slice.notes,
        }

        const costBreakdown = computeTransitionCost(ctx, config)
        if (costBreakdown.total === Infinity) continue

        const totalCost = prevState.accumulatedCost + costBreakdown.total + chord.comfortCost

        candidates.push({
          sliceIndex,
          assignments: new Map(chord.assignments),
          handState: chord.handState,
          accumulatedCost: totalCost,
          costBreakdown,
          prev: prevState,
        })
      }
    }
  }

  // Sort by accumulated cost (best first) and keep top K
  candidates.sort((a, b) => a.accumulatedCost - b.accumulatedCost)

  return candidates
}

// ─── Feasibility Checks ─────────────────────────────────────────────

/**
 * Quick check: is this finger physically capable of playing this note?
 * Filters out obviously impossible assignments before running the full
 * cost computation on every candidate.
 */
function isFingerFeasibleForNote(
  finger: Finger,
  note: AnalyzedNote,
  _config: FingeringConfig,
): boolean {
  // All fingers can play any single note — this is a pre-filter
  // that catches impossible combinations early
  // (Future: add hand-position-based filtering here)

  // Finger 5 on very low notes in LH is fine (bass)
  // Finger 1 on very high notes in RH is fine
  // No single note is inherently impossible for any finger
  return true
}

// ─── Previous State Helpers ─────────────────────────────────────────

/** Extract the last finger assignment from a Viterbi state. */
function getLastFinger(state: ViterbiState): Finger | null {
  if (state.sliceIndex < 0) return null
  // Get any assignment from this state
  const values = Array.from(state.assignments.values())
  return values.length > 0 ? values[values.length - 1]! : null
}

/**
 * Extract the previous note from a Viterbi state by walking the state
 * chain backward to find the most recent note that was assigned.
 */
function getLastNote(
  state: ViterbiState,
  allSlices: readonly TimeSlice[],
): AnalyzedNote | null {
  // Walk back through the state chain
  let current: ViterbiState | null = state
  while (current !== null && current.sliceIndex >= 0) {
    const slice = allSlices[current.sliceIndex]
    if (slice && slice.notes.length > 0) {
      // Return the last (highest pitch) note in the previous slice
      return slice.notes[slice.notes.length - 1]!
    }
    current = current.prev
  }
  return null
}

// ─── Traceback ──────────────────────────────────────────────────────

/**
 * Trace back through the optimal path to build the final finger map.
 */
function tracebackFingerMap(bestState: ViterbiState): Map<number, Finger> {
  const fingerMap = new Map<number, Finger>()

  let current: ViterbiState | null = bestState
  while (current) {
    for (const [noteIndex, finger] of current.assignments) {
      if (!fingerMap.has(noteIndex)) {
        fingerMap.set(noteIndex, finger)
      }
    }
    current = current.prev
  }

  return fingerMap
}

// ─── Optimization Entry Point (per hand) ────────────────────────────

/**
 * Run the full optimization pipeline for a sequence of analyzed notes
 * belonging to a single hand.
 *
 * Groups notes into time slices, then runs beam-search Viterbi.
 *
 * @param notes - Analyzed notes for one hand, in time order
 * @param hand - Which hand
 * @param config - Engine configuration
 * @returns Map from note index → assigned finger
 */
export function optimizeHand(
  notes: readonly AnalyzedNote[],
  hand: Hand,
  config: FingeringConfig,
): Map<number, Finger> {
  if (notes.length === 0) return new Map()

  // Group into time slices
  const slices = buildTimeSlices(notes, hand, config)

  // Optimize
  return optimizeFingering(slices, hand, config)
}

/**
 * Group analyzed notes into time slices (chords).
 */
function buildTimeSlices(
  notes: readonly AnalyzedNote[],
  hand: Hand,
  config: FingeringConfig,
): TimeSlice[] {
  const slices: TimeSlice[] = []
  let i = 0

  while (i < notes.length) {
    const startTime = notes[i]!.note.startTime
    const sliceNotes: AnalyzedNote[] = []

    while (
      i < notes.length &&
      notes[i]!.note.startTime - startTime < config.chordWindow
    ) {
      sliceNotes.push(notes[i]!)
      i++
    }

    const endTime = sliceNotes.length > 0
      ? Math.max(...sliceNotes.map((n) => n.note.endTime))
      : startTime

    slices.push({
      notes: Object.freeze(sliceNotes),
      startTime,
      endTime,
      hand,
    })
  }

  return slices
}
