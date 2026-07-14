/**
 * Piano Fingering Engine — Configuration
 *
 * Every weight, threshold, and limit is exposed here. No constants are
 * hardcoded in the algorithm modules. Tuning the engine means editing
 * this file or passing a custom config at runtime.
 */

import type { FingeringConfig } from './types'

// Re-export so other modules can import from config
export type { FingeringConfig }

/**
 * Default configuration tuned for sight-reading — prioritizes
 * intuitive, predictable fingerings over absolute mechanical optimality.
 *
 * Weights are multiplicative factors applied to each module's raw cost.
 * Set any weight to 0 to disable that module entirely.
 */
export const DEFAULT_CONFIG: FingeringConfig = {
  // ─── Beam Search ──────────────────────────────────────────────
  /** Number of states retained at each DP step. Higher = more optimal but slower. */
  beamWidth: 50,

  // ─── Hand Constraints ─────────────────────────────────────────
  /** Absolute maximum span between thumb and pinky (semitones). Larger → impossible. */
  maxHandSpan: 13,
  /** Comfortable span between thumb and pinky. Up to this is zero-cost. */
  comfortableSpan: 9,
  /** Minimum reasonable hand span for 1–5. */
  minHandSpan: 5,

  // ─── Cost Module Weights ──────────────────────────────────────
  /** Cost of transitioning between specific finger pairs. */
  fingerTransitionWeight: 0.5,
  /** Cost of stretching beyond comfortable intervals. Quadratic beyond comfort. */
  stretchWeight: 3.0,
  /** Cost of shifting the entire hand position. */
  handShiftWeight: 25.0,
  /** Cost of finger crossings (thumb-under, finger-over). */
  fingerCrossingWeight: 40.0,
  /** Penalty for using the same finger on consecutive different pitches. */
  repeatedFingerWeight: 40.0,
  /** High penalty for thumb playing a black key. */
  thumbBlackKeyWeight: 80.0,
  /** Reward/penalty for maintaining consistent directional fingering. */
  directionConsistencyWeight: 12.0,
  /** Penalty for deviating from standard pattern fingerings. */
  patternConsistencyWeight: 30.0,
  /** Negative cost (reward) applied when matching standard scale fingering. */
  scaleBiasWeight: 30.0,
  /** Negative cost (reward) applied when matching standard arpeggio fingering. */
  arpeggioBiasWeight: 25.0,
  /** Cost adjustment after large leaps — reduces previous-hand-position influence. */
  leapRecoveryWeight: 25.0,
  /** Reduction in repositioning cost at phrase boundaries. */
  phraseBoundaryWeight: 10.0,
  /** Cost of uncomfortable chord fingerings. */
  chordComfortWeight: 15.0,

  // ─── Pattern Detection Thresholds ─────────────────────────────
  /** Maximum semitone interval considered "stepwise" (2 = major 2nd). */
  stepwiseMaxInterval: 2,
  /** Minimum consecutive semitone moves to classify as chromatic. */
  chromaticMinRun: 4,
  /** Minimum total span in semitones to detect an arpeggio pattern. */
  arpeggioMinSpan: 12,
  /** Maximum interval between consecutive broken-chord notes. */
  brokenChordMaxInterval: 7,
  /** Maximum time between consecutive same-pitch notes to count as "repeated." */
  repeatedNoteTimeWindow: 0.5,
  /** Minimum interval in semitones to classify as a large leap. */
  largeLeapMinInterval: 12,
  /** Time window for detecting repeated accompaniment figures. */
  accompanimentRepetitionWindow: 2.0,

  // ─── Phrase Detection ─────────────────────────────────────────
  /** Minimum rest duration (seconds) to mark a phrase boundary. */
  phraseBoundaryMinRest: 0.5,
  /** Minimum number of notes required to form a phrase. */
  phraseBoundaryMinLength: 4,

  // ─── Chord Optimization ───────────────────────────────────────
  /** Maximum number of notes allowed in a single-hand chord. */
  maxChordNotes: 5,
  /** Maximum total span within a single-hand chord (semitones). */
  chordMaxSpan: 13,

  // ─── Template Toggles ─────────────────────────────────────────
  /** When true, detected scale passages bias toward standard scale fingerings. */
  enableScaleTemplates: true,
  /** When true, detected arpeggios bias toward standard arpeggio fingerings. */
  enableArpeggioTemplates: true,

  // ─── Misc ─────────────────────────────────────────────────────
  /** Time window (seconds) for treating notes as simultaneous. */
  chordWindow: 0.10,
  /** When true, generate per-note debug info (slightly slower, memory-heavy). */
  enableDebug: false,
}
