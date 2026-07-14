/**
 * Piano Fingering Engine — Hand Model
 *
 * Maintains an estimated hand position during optimization. Rather than
 * evaluating finger transitions in isolation, the optimizer tracks where
 * the hand "rests" — the natural thumb position from which all fingers
 * can comfortably reach their targets.
 *
 * This produces much more natural movement than considering only
 * finger-to-finger transitions, because it models what pianists actually
 * do: position the hand to cover a range of notes, then use fingers
 * within that position.
 */

import type { Finger, Hand, HandState, MelodicDirection } from './types'

/**
 * Given a finger F playing MIDI note N, estimate the thumb position.
 *
 * Each finger "rests" at a certain interval above the thumb in a
 * relaxed hand position:
 *   Finger 1 (thumb):   0 semitones above thumb position
 *   Finger 2 (index):   ~2 semitones above (major 2nd)
 *   Finger 3 (middle):  ~4 semitones above (major 3rd)
 *   Finger 4 (ring):    ~6 semitones above (tritone)
 *   Finger 5 (pinky):   ~8 semitones above (minor 6th)
 *
 * These are approximate resting positions — actual comfortable intervals
 * depend on hand size and stretch.
 */
const FINGER_REST_OFFSET: Record<Finger, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
}

/**
 * For a given finger F on note N, where would the thumb rest?
 */
export function thumbPositionForFinger(finger: Finger, midiNote: number): number {
  return midiNote - FINGER_REST_OFFSET[finger]
}

/**
 * For a given thumb position, where would each finger naturally rest?
 */
export function fingerRestPosition(thumbPosition: number, finger: Finger): number {
  return thumbPosition + FINGER_REST_OFFSET[finger]
}

/**
 * Create a HandState from a specific finger+note assignment.
 * The center of the hand is estimated as the position of finger 3.
 */
export function handStateFromFinger(
  finger: Finger,
  midiNote: number,
  direction: MelodicDirection,
): HandState {
  const thumbPos = thumbPositionForFinger(finger, midiNote)
  const center = thumbPos + 4 // finger 3 offset

  return {
    thumbPosition: thumbPos,
    handCenter: center,
    comfortableSpan: 9,
    direction,
  }
}

/**
 * Create a HandState for a chord.
 * The thumb position is estimated from the lowest note's assigned finger
 * and the hand center is the average of all note positions.
 */
export function handStateFromChord(
  assignments: ReadonlyMap<number, Finger>,
  sortedMidis: readonly number[],
  direction: MelodicDirection,
): HandState {
  if (sortedMidis.length === 0) {
    return { thumbPosition: 60, handCenter: 64, comfortableSpan: 9, direction: 'neutral' }
  }

  // Estimate thumb position from the lowest note's finger
  const lowestNote = sortedMidis[0]!
  const lowestFinger = assignments.get(0) ?? 1 // Use note indices as keys
  const thumbPos = thumbPositionForFinger(lowestFinger, lowestNote)

  // Hand center = average of all notes
  const center = sortedMidis.reduce((a, b) => a + b, 0) / sortedMidis.length

  return {
    thumbPosition: Math.round(thumbPos),
    handCenter: Math.round(center),
    comfortableSpan: 9,
    direction,
  }
}

/**
 * Create a neutral, centered hand state for the start of a phrase.
 */
export function neutralHandState(hand: Hand): HandState {
  if (hand === 'right') {
    // RH neutral position: thumb near C4 (60), center near E4 (64)
    return { thumbPosition: 60, handCenter: 64, comfortableSpan: 9, direction: 'neutral' }
  } else {
    // LH neutral position: thumb near G3 (55), center near B3 (59)
    return { thumbPosition: 55, handCenter: 59, comfortableSpan: 9, direction: 'neutral' }
  }
}

/**
 * Estimate hand shift distance between two hand states.
 * Returns the absolute difference in thumb positions.
 */
export function handShiftDistance(from: HandState, to: HandState): number {
  return Math.abs(to.thumbPosition - from.thumbPosition)
}

/**
 * Compute a hand shift cost.
 *
 * Small shifts (1-2 semitones) are cheap — the hand naturally micro-adjusts.
 * Medium shifts (3-6) cost proportionally.
 * Large shifts (7+) cost quadratically.
 * Shifts at phrase boundaries cost less.
 */
export function handShiftCost(
  from: HandState,
  to: HandState,
  isPhraseBoundary: boolean,
): number {
  const distance = handShiftDistance(from, to)

  if (distance === 0) return 0

  // Phrase boundaries reduce repositioning cost at all levels
  const boundaryFactor = isPhraseBoundary ? 0.4 : 1.0

  if (distance <= 2) return distance * 2 * boundaryFactor
  if (distance <= 6) return distance * 4 * boundaryFactor
  if (distance <= 12) return distance * distance * 1.5 * boundaryFactor

  // Very large jumps
  return distance * distance * 2 * boundaryFactor
}

/**
 * Check whether the hand can reach all notes in a chord from a given
 * thumb position without exceeding the maximum comfortable span.
 */
export function canReachFromPosition(
  thumbPosition: number,
  sortedMidis: readonly number[],
  maxSpan: number,
): boolean {
  if (sortedMidis.length === 0) return true
  const lowest = sortedMidis[0]!
  const highest = sortedMidis[sortedMidis.length - 1]!

  // The thumb must be at or below the lowest note,
  // and the pinky must be able to reach the highest note
  if (thumbPosition > lowest) return false // thumb can't be above the lowest note

  const span = highest - thumbPosition
  return span <= maxSpan
}

/**
 * Determine hand movement direction between two hand states.
 */
export function handDirection(from: HandState, to: HandState): MelodicDirection {
  const diff = to.handCenter - from.handCenter
  if (Math.abs(diff) < 1) return 'same'
  return diff > 0 ? 'up' : 'down'
}
