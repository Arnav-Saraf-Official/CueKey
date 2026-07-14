/**
 * Piano Fingering Engine — Finger Ergonomics
 *
 * Lookup tables describing comfortable pitch intervals for every finger pair.
 * These encode the physical reality of the human hand:
 *   - Thumb (1) is short and thick, best on white keys
 *   - Index (2) and middle (3) are strongest and most independent
 *   - Ring (4) shares a tendon with 3 and 5, weakest independent finger
 *   - Pinky (5) is short, used for outer edges
 *
 * Each finger pair has a "comfort zone" (ideal, min, max comfortable)
 * and an absolute maximum beyond which the stretch is physically impossible
 * for most players.
 *
 * References:
 *   - Roskell, "The Art of Piano Fingering" (2018)
 *   - Measured hand spans: average adult can reach 8-10 semitones 1–5
 */

import type { Finger } from './types'

// ─── Per-Finger Properties ──────────────────────────────────────────

/** Physical characteristics of each finger. */
export interface FingerProperties {
  /** Finger number (1–5). */
  readonly finger: Finger
  /** Human-readable name. */
  readonly name: string
  /** Relative length (3 = longest). */
  readonly relativeLength: number
  /** Independence from neighboring fingers (higher = more independent). */
  readonly independence: number
  /** Natural preference for black keys (higher = better suited). */
  readonly blackKeyPreference: number
  /** Relative strength. */
  readonly strength: number
}

/**
 * Properties for each finger, ordered 1–5.
 *
 * Finger 4 has the lowest independence because it shares a tendon
 * with fingers 3 and 5 — it physically cannot move fully independently.
 */
export const FINGER_PROPERTIES: Record<Finger, FingerProperties> = {
  1: { finger: 1, name: 'thumb',      relativeLength: 1, independence: 7, blackKeyPreference: 1, strength: 8 },
  2: { finger: 2, name: 'index',      relativeLength: 3, independence: 9, blackKeyPreference: 7, strength: 7 },
  3: { finger: 3, name: 'middle',     relativeLength: 4, independence: 8, blackKeyPreference: 8, strength: 9 },
  4: { finger: 4, name: 'ring',       relativeLength: 2, independence: 3, blackKeyPreference: 9, strength: 5 },
  5: { finger: 5, name: 'pinky',      relativeLength: 1, independence: 4, blackKeyPreference: 3, strength: 4 },
}

// ─── Finger Pair Intervals ──────────────────────────────────────────

/**
 * Comfortable interval range between two fingers.
 * All values in semitones.
 */
export interface FingerPairInterval {
  /** Most comfortable / "ideal" interval between these two fingers. */
  readonly ideal: number
  /** Minimum comfortable interval. Below this feels cramped. */
  readonly minComfortable: number
  /** Maximum comfortable interval. Above this starts to stretch. */
  readonly maxComfortable: number
  /** Absolute maximum possible interval for most players. */
  readonly maxPossible: number
  /**
   * Cost multiplier for stretching within the comfort-to-max range.
   * Higher values make this finger pair more sensitive to stretching.
   */
  readonly stretchSensitivity: number
}

/**
 * Ergonomic intervals for every ordered finger pair (fromFinger, toFinger).
 *
 * Keyed as `"fromFinger-toFinger"` (e.g., "1-3" for thumb→middle).
 * The pair is ordered because the hand's anatomy is not symmetric —
 * stretching 1→5 is different from 5→1 (same physical reality but
 * different musical meaning depending on direction).
 *
 * Values based on average adult hand anatomy:
 *   - Adjacent fingers naturally sit ~2 semitones apart
 *   - 1→3 comfortable span of a 4th (5 semitones)
 *   - 1→5 comfortable span of a 6th–7th (9–10 semitones)
 */
export const FINGER_PAIR_INTERVALS: Record<string, FingerPairInterval> = {
  // Same-finger (repeated finger on different pitch — physically possible via hand slide, musically discouraged)
  '1-1': { ideal: 0,  minComfortable: 0,  maxComfortable: 0,  maxPossible: 12, stretchSensitivity: 3.0 },
  '2-2': { ideal: 0,  minComfortable: 0,  maxComfortable: 0,  maxPossible: 12, stretchSensitivity: 3.0 },
  '3-3': { ideal: 0,  minComfortable: 0,  maxComfortable: 0,  maxPossible: 12, stretchSensitivity: 3.0 },
  '4-4': { ideal: 0,  minComfortable: 0,  maxComfortable: 0,  maxPossible: 12, stretchSensitivity: 3.0 },
  '5-5': { ideal: 0,  minComfortable: 0,  maxComfortable: 0,  maxPossible: 12, stretchSensitivity: 3.0 },

  // Adjacent finger pairs
  '1-2': { ideal: 2,  minComfortable: 1,  maxComfortable: 4,  maxPossible: 7,  stretchSensitivity: 1.0 },
  '2-1': { ideal: 2,  minComfortable: 1,  maxComfortable: 4,  maxPossible: 7,  stretchSensitivity: 1.0 },
  '2-3': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 5,  stretchSensitivity: 1.5 },
  '3-2': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 5,  stretchSensitivity: 1.5 },
  '3-4': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 4,  stretchSensitivity: 2.0 },
  '4-3': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 4,  stretchSensitivity: 2.0 },
  '4-5': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 4,  stretchSensitivity: 2.0 },
  '5-4': { ideal: 2,  minComfortable: 1,  maxComfortable: 3,  maxPossible: 4,  stretchSensitivity: 2.0 },

  // Skip-one finger pairs (e.g., 1→3, 2→4, 3→5)
  '1-3': { ideal: 5,  minComfortable: 3,  maxComfortable: 7,  maxPossible: 10, stretchSensitivity: 1.0 },
  '3-1': { ideal: 5,  minComfortable: 3,  maxComfortable: 7,  maxPossible: 10, stretchSensitivity: 1.0 },
  '2-4': { ideal: 5,  minComfortable: 3,  maxComfortable: 6,  maxPossible: 8,  stretchSensitivity: 1.5 },
  '4-2': { ideal: 5,  minComfortable: 3,  maxComfortable: 6,  maxPossible: 8,  stretchSensitivity: 1.5 },
  '3-5': { ideal: 5,  minComfortable: 3,  maxComfortable: 6,  maxPossible: 7,  stretchSensitivity: 1.5 },
  '5-3': { ideal: 5,  minComfortable: 3,  maxComfortable: 6,  maxPossible: 7,  stretchSensitivity: 1.5 },

  // Skip-two finger pairs (e.g., 1→4, 2→5)
  '1-4': { ideal: 7,  minComfortable: 5,  maxComfortable: 9,  maxPossible: 11, stretchSensitivity: 1.2 },
  '4-1': { ideal: 7,  minComfortable: 5,  maxComfortable: 9,  maxPossible: 11, stretchSensitivity: 1.2 },
  '2-5': { ideal: 7,  minComfortable: 5,  maxComfortable: 8,  maxPossible: 10, stretchSensitivity: 1.5 },
  '5-2': { ideal: 7,  minComfortable: 5,  maxComfortable: 8,  maxPossible: 10, stretchSensitivity: 1.5 },

  // Maximum span (thumb → pinky)
  '1-5': { ideal: 9,  minComfortable: 6,  maxComfortable: 10, maxPossible: 13, stretchSensitivity: 1.0 },
  '5-1': { ideal: 9,  minComfortable: 6,  maxComfortable: 10, maxPossible: 13, stretchSensitivity: 1.0 },
}

// ─── Lookup Helpers ─────────────────────────────────────────────────

/**
 * Get the ergonomic interval data for a finger pair.
 * Returns undefined if no data exists (shouldn't happen for valid fingers 1–5).
 */
export function getFingerPairInterval(from: Finger, to: Finger): FingerPairInterval {
  return FINGER_PAIR_INTERVALS[`${from}-${to}`]!
}

/**
 * Check if a given semitone interval is physically possible
 * between two fingers for a typical hand.
 */
export function isIntervalPossible(from: Finger, to: Finger, semitones: number): boolean {
  const data = getFingerPairInterval(from, to)
  return semitones <= data.maxPossible
}

/**
 * Check if a given semitone interval is comfortable between two fingers.
 */
export function isIntervalComfortable(from: Finger, to: Finger, semitones: number): boolean {
  const data = getFingerPairInterval(from, to)
  return semitones >= data.minComfortable && semitones <= data.maxComfortable
}

/**
 * Compute a stretch cost for moving from one finger+note to another.
 *
 * Cost is 0 within the comfort zone, then grows quadratically
 * from maxComfortable to maxPossible, and returns Infinity beyond maxPossible.
 *
 * @param from - Starting finger
 * @param to - Target finger
 * @param semitones - Absolute interval between the two notes
 * @returns Cost (0 = perfect comfort, Infinity = impossible)
 */
export function stretchCost(from: Finger, to: Finger, semitones: number): number {
  const data = getFingerPairInterval(from, to)

  if (semitones <= data.maxComfortable) return 0

  const excess = semitones - data.maxComfortable
  const maxExcess = data.maxPossible - data.maxComfortable

  if (excess >= maxExcess) return Infinity

  // Quadratic cost: small excess is cheap, large excess is very expensive
  const normalized = excess / maxExcess
  return data.stretchSensitivity * normalized * normalized * 100
}

// ─── Thumb-on-Black-Key Logic ───────────────────────────────────────

/**
 * Thumb on a black key is generally discouraged because:
 *   1. The thumb is short — pressing an elevated black key forces
 *      the wrist forward, breaking natural hand position.
 *   2. It makes legato thumb crossings much harder.
 *
 * Exceptions where thumb-on-black is acceptable:
 *   - Pieces that are primarily on black keys (e.g., Chopin Op.10 No.5)
 *   - Chords/octaves spanning black keys
 *   - When the entire hand is positioned over black-key territory
 */
export function isThumbOnBlackAllowed(
  _midiNote: number,
  chordNotes: readonly number[],
  overallBlackKeyDensity: number,
): boolean {
  // If overall density of black keys in the passage is high (>40%),
  // thumb on black is more acceptable
  if (overallBlackKeyDensity > 0.4) return true

  // If this is a chord/octave where all notes are black keys
  if (chordNotes.length >= 2 && chordNotes.every((n) => isBlackKeyStatic(n))) {
    return true
  }

  return false
}

/** Static helper for the above. */
function isBlackKeyStatic(midiNote: number): boolean {
  return [1, 3, 6, 8, 10].includes(midiNote % 12)
}

// ─── Hand Span Check ────────────────────────────────────────────────

/**
 * Check if a set of simultaneous notes can be physically reached
 * by a single hand.
 *
 * @param sortedMidis - MIDI notes sorted low→high
 * @param maxSpan - Maximum allowed span in semitones
 * @returns true if the chord can be played by one hand
 */
export function canHandReachChord(sortedMidis: readonly number[], maxSpan: number): boolean {
  if (sortedMidis.length <= 1) return true
  const span = sortedMidis[sortedMidis.length - 1]! - sortedMidis[0]!
  return span <= maxSpan
}
