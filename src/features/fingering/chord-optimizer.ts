/**
 * Piano Fingering Engine — Chord Optimization
 *
 * Treats chords as a single optimization problem rather than assigning
 * fingers independently. For a chord of N notes, generates all physically
 * legal finger combinations (fingers must be monotonic with pitch),
 * filters impossible hand spans, and evaluates each for comfort.
 *
 * The best fingering for a chord is not necessarily the most comfortable
 * chord alone — it should also prepare for the following notes. That
 * decision is made by the main optimizer which evaluates chord candidates
 * against transition costs.
 */

import type { Finger, Hand, AnalyzedNote, ChordCandidate, HandState } from './types'
import type { FingeringConfig } from './config'
import { evaluateChordFingering } from './costs'
import { canHandReachChord } from './ergonomics'
import { handStateFromFinger, neutralHandState } from './hand-model'

/**
 * Generate all physically legal finger combinations for a chord.
 *
 * Rules:
 *   1. Fingers must be monotonic with pitch (no crossing within a chord)
 *   2. For RH: higher notes get higher finger numbers
 *   3. For LH: lower notes get lower finger numbers (mirror of RH: higher notes
 *      get lower finger numbers since the hand is reversed)
 *   4. Total span must not exceed maxHandSpan
 *   5. Adjacent finger spans must be physically possible
 *
 * @param sortedNotes - Chord notes sorted low→high by pitch
 * @param hand - Which hand is playing
 * @param config - Engine configuration
 * @returns Valid chord fingering candidates sorted by comfort (best first)
 */
export function generateChordCandidates(
  sortedNotes: readonly AnalyzedNote[],
  hand: Hand,
  config: FingeringConfig,
): ChordCandidate[] {
  const n = sortedNotes.length
  const sortedMidis = sortedNotes.map((an) => an.note.midiNote)

  if (n === 0) return []
  if (n > config.maxChordNotes) {
    // Too many notes for one hand — generate best-effort using all 5 fingers
    return [generateBestEffortChord(sortedMidis, hand, config)]
  }

  // Generate all combinations of n fingers from {1,2,3,4,5}
  const allCombos = generateFingerCombinations(n)

  const candidates: ChordCandidate[] = []

  for (const fingers of allCombos) {
    // For LH, fingers are reversed: lowest note gets highest finger number
    // Actually standard approach: assign fingers monotonic with pitch.
    // - RH (low→high): fingers increase (1→5)
    // - LH (low→high): fingers decrease (5→1)
    // So the finger ordering is different by hand.
    const orderedFingers = hand === 'right' ? fingers : fingers.slice().reverse()

    // Validate the fingering
    if (!isChordFingeringValid(sortedMidis, orderedFingers, hand, config)) continue

    // Score this fingering
    const comfortCost = evaluateChordFingering(sortedMidis, orderedFingers, hand, config)
    if (comfortCost === Infinity) continue

    // Build assignment map: note index → finger
    const assignments = new Map<number, Finger>()
    for (let i = 0; i < n; i++) {
      assignments.set(sortedNotes[i]!.note.index, orderedFingers[i]!)
    }

    // Estimate hand state after playing this chord
    // Use the middle note's finger and position to estimate hand center
    const middleIdx = Math.floor(n / 2)
    const handState = handStateFromFinger(
      orderedFingers[middleIdx]!,
      sortedMidis[middleIdx]!,
      'neutral',
    )

    candidates.push({
      assignments,
      comfortCost,
      handState,
    })
  }

  // Sort by comfort (best first)
  candidates.sort((a, b) => a.comfortCost - b.comfortCost)

  return candidates
}

// ─── Finger Combination Generation ──────────────────────────────────

/**
 * Generate all combinations of n fingers from {1,2,3,4,5}.
 * Combinations are in ascending order (e.g., [1,2], [1,3], ..., [4,5]).
 *
 * C(5,1)=5, C(5,2)=10, C(5,3)=10, C(5,4)=5, C(5,5)=1
 */
function generateFingerCombinations(n: number): Finger[][] {
  if (n < 1 || n > 5) return []
  const result: Finger[][] = []
  const fingers: Finger[] = [1, 2, 3, 4, 5]

  function backtrack(start: number, current: Finger[]): void {
    if (current.length === n) {
      result.push([...current])
      return
    }
    for (let i = start; i < fingers.length; i++) {
      current.push(fingers[i]!)
      backtrack(i + 1, current)
      current.pop()
    }
  }

  backtrack(0, [])
  return result
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Check if a chord fingering is physically valid:
 *   1. Total span is within limits
 *   2. Fingers are monotonic with pitch (no crossing within a chord)
 *   3. Each adjacent finger pair can reach its interval
 *
 * For RH: fingers increase with pitch (low note → finger 1, high note → finger 5).
 * For LH: fingers decrease with pitch (low note → finger 5, high note → finger 1).
 */
function isChordFingeringValid(
  sortedMidis: readonly number[],
  fingers: readonly Finger[],
  hand: Hand,
  config: FingeringConfig,
): boolean {
  // Total span check
  if (!canHandReachChord(sortedMidis, config.maxHandSpan)) return false

  // Adjacent finger checks
  for (let i = 0; i < sortedMidis.length - 1; i++) {
    const fromF = fingers[i]!
    const toF = fingers[i + 1]!
    const interval = sortedMidis[i + 1]! - sortedMidis[i]!

    // Monotonicity: for RH, fingers increase with pitch; for LH, decrease with pitch
    if (hand === 'right') {
      if (toF <= fromF) return false
    } else {
      if (toF >= fromF) return false
    }

    // Check interval is possible for this finger pair
    if (interval > 13) return false // absolute max for any pair

    // For adjacent finger numbers (e.g., 1-2, 2-3), max comfortable is small
    // Works for both hands: |toF - fromF| = 1 means adjacent fingers
    if (Math.abs(toF - fromF) === 1 && interval > 7) return false
  }

  return true
}

// ─── Best-Effort for Large Chords (>5 notes) ────────────────────────

/**
 * When a chord has more than 5 notes (very rare for one hand),
 * assign fingers as evenly as possible, doubling some fingers.
 */
function generateBestEffortChord(
  sortedMidis: readonly number[],
  _hand: Hand,
  _config: FingeringConfig,
): ChordCandidate {
  const n = sortedMidis.length
  const assignments = new Map<number, Finger>()

  // Distribute 5 fingers across n notes as evenly as possible
  for (let i = 0; i < n; i++) {
    const finger = Math.min(Math.ceil(((i + 1) / n) * 5), 5) as Finger
    assignments.set(i, finger)
  }

  const middleIdx = Math.floor(n / 2)
  const middleMidi = sortedMidis[middleIdx]!
  const middleFinger = assignments.get(middleIdx)!

  return {
    assignments,
    comfortCost: 50, // high cost, this is a fallback
    handState: handStateFromFinger(middleFinger, middleMidi, 'neutral'),
  }
}
