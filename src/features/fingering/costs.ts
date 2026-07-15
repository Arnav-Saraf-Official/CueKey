/**
 * Piano Fingering Engine — Transition Cost System
 *
 * Each cost module is an independent, weighted function that evaluates
 * a specific aspect of a fingering transition. Modules are composable:
 * the total transition cost is the sum of all enabled modules.
 *
 * Every module is independently testable and documents the musical
 * reasoning behind its algorithm.
 *
 * Design principle: no single giant cost function. Instead, small focused
 * modules that each model one aspect of piano ergonomics or musical context.
 */

import type { Finger, HandState, AnalyzedNote, CostBreakdown, PatternTag, Hand } from './types'
import type { FingeringConfig } from './config'
import {
  getFingerPairInterval,
  FINGER_PROPERTIES,
  isThumbOnBlackAllowed,
  isIntervalPossible,
} from './ergonomics'
import { thumbPositionForFinger, handShiftDistance } from './hand-model'

// ─── Cost Context ───────────────────────────────────────────────────

/**
 * All information a cost module needs to evaluate a transition.
 */
export interface CostContext {
  /** Previous hand state (null for first note in phrase). */
  readonly prevHandState: HandState | null
  /** Finger being assigned to the current note. */
  readonly finger: Finger
  /** The note being fingered. */
  readonly note: AnalyzedNote
  /** Previous finger (null for first note). */
  readonly prevFinger: Finger | null
  /** The previous note (null for first note). */
  readonly prevNote: AnalyzedNote | null
  /** Which hand this note belongs to. */
  readonly hand: Hand
  /** Whether this note starts a phrase (resets hand position tracking). */
  readonly isPhraseStart: boolean
  /** Whether this note ends a phrase. */
  readonly isPhraseEnd: boolean
  /** All notes in the current time slice (for chord context). */
  readonly sliceNotes: readonly AnalyzedNote[]
}

/**
 * Compute a full cost breakdown for a transition.
 * Returns individual module costs plus the weighted total.
 */
export function computeTransitionCost(
  ctx: CostContext,
  config: FingeringConfig,
): CostBreakdown {
  const fingerTransition = config.fingerTransitionWeight * fingerTransitionCost(ctx)
  const stretch = config.stretchWeight * stretchCostModule(ctx)
  const handShift = config.handShiftWeight * handShiftCostModule(ctx, config)
  const fingerCrossing = config.fingerCrossingWeight * fingerCrossingCost(ctx)
  const repeatedFinger = config.repeatedFingerWeight * repeatedFingerCost(ctx)
  const thumbBlackKey = config.thumbBlackKeyWeight * thumbBlackKeyCost(ctx, config)
  const directionConsistency = config.directionConsistencyWeight * directionConsistencyCost(ctx)
  const patternConsistency = config.patternConsistencyWeight * patternConsistencyCost(ctx)
  const scaleBias = config.scaleBiasWeight * scaleBiasCost(ctx, config)
  const arpeggioBias = config.arpeggioBiasWeight * arpeggioBiasCost(ctx, config)
  const leapRecovery = config.leapRecoveryWeight * leapRecoveryCost(ctx, config)
  const phraseBoundary = config.phraseBoundaryWeight * phraseBoundaryCost(ctx)
  const chordComfort = config.chordComfortWeight * chordComfortCost(ctx, config)

  const total =
    fingerTransition + stretch + handShift + fingerCrossing +
    repeatedFinger + thumbBlackKey + directionConsistency +
    patternConsistency + scaleBias + arpeggioBias +
    leapRecovery + phraseBoundary + chordComfort

  return {
    fingerTransition, stretch, handShift, fingerCrossing,
    repeatedFinger, thumbBlackKey, directionConsistency,
    patternConsistency, scaleBias, arpeggioBias,
    leapRecovery, phraseBoundary, chordComfort, total,
  }
}

// ─── 1. Finger Transition Cost ──────────────────────────────────────
//
// Some finger-to-finger transitions are inherently more awkward than
// others due to hand anatomy. Finger 4 is the weakest independent
// finger; moving 4→5 or 5→4 is harder than 2→3.
//
// This module adds a small base cost for transitions between fingers
// with poor independence, scaled by the interval size.

function fingerTransitionCost(ctx: CostContext): number {
  if (!ctx.prevFinger || !ctx.prevNote) return 0

  const fromProps = FINGER_PROPERTIES[ctx.prevFinger]
  const toProps = FINGER_PROPERTIES[ctx.finger]

  // Base cost from finger independence: lower independence = higher cost
  const independencePenalty = (10 - fromProps.independence) * 0.5 +
    (10 - toProps.independence) * 0.5

  // Extra cost for the 4-5 pair (weakest combination)
  const isFourFive =
    (ctx.prevFinger === 4 && ctx.finger === 5) ||
    (ctx.prevFinger === 5 && ctx.finger === 4)
  const fourFivePenalty = isFourFive ? 15 : 0

  // Extra cost for 3-4 and 4-3 (tendon sharing)
  const isThreeFour =
    (ctx.prevFinger === 3 && ctx.finger === 4) ||
    (ctx.prevFinger === 4 && ctx.finger === 3)
  const threeFourPenalty = isThreeFour ? 8 : 0

  return independencePenalty + fourFivePenalty + threeFourPenalty
}

// ─── 2. Stretch Cost ────────────────────────────────────────────────
//
// Evaluates stretch relative to hand position, not raw note interval.
// Key insight: if the hand shifts to accommodate a new finger, there's
// no effective stretch — the hand shift cost covers that separately.
// Stretch cost catches cases where fingers must deviate from their
// natural resting positions within the current hand position.
//
// Uses the hand-position-adjusted interval:
//   adjustedInterval = noteInterval - handShift
//   where handShift = (new hand pos) - (prev hand pos)
//
// If adjustedInterval ≈ natural finger spacing → 0 cost.
// If fingers must stretch beyond natural → quadratic cost.

function stretchCostModule(ctx: CostContext): number {
  if (!ctx.prevFinger || !ctx.prevNote) return 0

  const noteInterval = Math.abs(ctx.note.note.midiNote - ctx.prevNote.note.midiNote)

  // Compute natural finger spacing for this pair
  const FINGER_OFFSETS: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 6, 5: 8 }
  const naturalSpacing = Math.abs(FINGER_OFFSETS[ctx.finger]! - FINGER_OFFSETS[ctx.prevFinger]!)

  // Compute hand shift between the two notes' ideal hand positions
  const prevHandPos = ctx.prevNote.note.midiNote - FINGER_OFFSETS[ctx.prevFinger]!
  const newHandPos = ctx.note.note.midiNote - FINGER_OFFSETS[ctx.finger]!
  const handShift = Math.abs(newHandPos - prevHandPos)

  // The "hand-adjusted interval" — how much finger stretch is needed
  // after accounting for the hand shift
  const adjustedInterval = Math.abs(noteInterval - handShift)

  // If adjusted interval matches natural finger spacing, fingers sit naturally
  const excess = adjustedInterval - naturalSpacing

  if (excess <= 0) return 0  // fingers at or within natural spacing

  // Check finger pair limits (from ergonomics table)
  const pairData = getFingerPairInterval(ctx.prevFinger, ctx.finger)
  if (excess > (pairData.maxPossible - pairData.maxComfortable)) return Infinity

  // Quadratic cost for stretch beyond natural spacing
  const maxAllowed = pairData.maxPossible - pairData.maxComfortable
  const normalized = excess / maxAllowed
  return normalized * normalized * 80
}

// ─── 3. Hand Shift Cost ─────────────────────────────────────────────
//
// Models the cost of repositioning the hand. Pianists naturally micro-adjust
// hand position, but large jumps require conscious effort and time.
//
// Small shifts (1-2 semitones): very cheap
// Medium shifts (3-6): proportional
// Large shifts (7+): quadratic cost
// Phrase boundaries reduce the effective cost.

function handShiftCostModule(ctx: CostContext, config: FingeringConfig): number {
  if (!ctx.prevHandState) return 0

  const newThumbPos = thumbPositionForFinger(ctx.finger, ctx.note.note.midiNote)
  const distance = Math.abs(newThumbPos - ctx.prevHandState.thumbPosition)

  if (distance === 0) return 0

  // For 1-octave arpeggios (span ≤ 12): hand stays in one position.
  // Use the arpeggio's overall hand center instead of per-note hand position.
  // This prevents per-note hand-shift penalties from fighting chord-like fingering.
  const span = ctx.note.patternSpan
  const minNote = ctx.note.patternMinNote
  const hasCompactPattern = (ctx.note.patternTags.includes('arpeggio') ||
    ctx.note.patternTags.includes('broken-chord')) &&
    span !== null && minNote !== null && span > 0 && span <= 12

  if (hasCompactPattern && ctx.prevNote &&
      (ctx.prevNote.patternTags.includes('arpeggio') ||
       ctx.prevNote.patternTags.includes('broken-chord'))) {
    // Both notes are in the same compact arpeggio — hand shouldn't shift
    // Use drastically reduced cost since hand stays in chord position
    if (distance <= 3) return 0     // micro-adjustment, free
    if (distance <= 6) return distance * 1  // very cheap
    return distance * 2              // still cheap
  }

  if (distance <= 2) return distance * 2
  if (distance <= 6) return distance * 4

  // Large shift
  const isBoundary = ctx.isPhraseStart
  if (isBoundary) return distance * 3  // cheaper at boundaries
  return distance * distance * 1.5
}

// ─── 4. Finger Crossing Cost ────────────────────────────────────────
//
// Models the cost of thumb-under and finger-over crossings.
//
// Thumb-under-3 (or 4) during ascending scales: acceptable, moderate cost.
// Thumb-under-random: higher cost.
// Finger 3/4 crossing over thumb: moderate cost.
// Finger 5 crossing under anything: essentially forbidden.
// Thumb crossing over 5: essentially forbidden.

function fingerCrossingCost(ctx: CostContext): number {
  if (!ctx.prevFinger || !ctx.prevNote) return 0

  const fromF = ctx.prevFinger
  const toF = ctx.finger
  const interval = ctx.note.note.midiNote - ctx.prevNote.note.midiNote

  // ── 4↔5 Crossover ──────────────────────────────────────────────
  // Fingers 4 and 5 crossing each other: essentially never happens in
  // standard piano technique. The ring finger and pinky share a tendon
  // and cannot cross without extreme tension.
  //
  // RH: 4→5 on descending = 5 crosses under 4 to play lower note
  // RH: 5→4 on ascending  = 4 crosses over 5 to play higher note
  // LH: 4→5 on ascending  = 5 crosses (moves further left) for higher note
  // LH: 5→4 on descending = 4 crosses (moves further right) for lower note
  const isFourFivePair =
    (fromF === 4 && toF === 5) || (fromF === 5 && toF === 4)

  if (isFourFivePair && interval !== 0) {
    const isCrossing =
      (ctx.hand === 'right' && fromF === 4 && toF === 5 && interval < 0) ||
      (ctx.hand === 'right' && fromF === 5 && toF === 4 && interval > 0) ||
      (ctx.hand === 'left'  && fromF === 4 && toF === 5 && interval > 0) ||
      (ctx.hand === 'left'  && fromF === 5 && toF === 4 && interval < 0)
    if (isCrossing) return 100  // essentially forbidden
  }

  // ── Thumb-on-black during crossing ──────────────────────────────
  // Standard thumb-under (3→1, 4→1 ascending) is fine — UNLESS the
  // thumb lands on a black key. The thumb is short; pivoting it under
  // the hand onto an elevated black key is extremely awkward.
  // Same for finger-over-thumb (1→3, 1→4 descending) starting from
  // a black-key thumb.
  if (ctx.note.note.isBlackKey) {
    // Thumb-under crossing onto black key
    if (fromF >= 3 && toF === 1 && interval > 0) return 90
    // Finger-over-thumb descending from black-key thumb
    if (fromF === 1 && toF >= 3 && interval < 0 &&
        ctx.prevNote.note.isBlackKey) return 90
  }

  // Helper: is this a recognized pattern where crossings are standard?
  const isStandardPattern = ctx.note.patternTags.includes('scale-ascending') ||
    ctx.note.patternTags.includes('stepwise-up') ||
    ctx.note.patternTags.includes('arpeggio') ||
    ctx.note.patternTags.includes('broken-chord')

  const isStandardDescending = ctx.note.patternTags.includes('scale-descending') ||
    ctx.note.patternTags.includes('stepwise-down') ||
    ctx.note.patternTags.includes('arpeggio') ||
    ctx.note.patternTags.includes('broken-chord')

  // Thumb under: ascending, from 3/4 to 1
  if (fromF >= 3 && toF === 1 && interval > 0) {
    return isStandardPattern ? 5 : 20
  }

  // Thumb under from 5: very awkward
  if (fromF === 5 && toF === 1 && interval > 0) {
    return 50
  }

  // Finger over thumb: descending, from 1 to 3/4
  if (fromF === 1 && toF >= 3 && interval < 0) {
    return isStandardDescending ? 5 : 20
  }

  // Finger 4/5 crossing over thumb: awkward
  if (fromF === 1 && toF >= 4 && interval < 0) {
    return 35
  }

  // Crossing 4 under hand: nearly always bad
  if (fromF === 4 && toF < 3 && interval > 0) {
    return 40
  }

  // Crossing 5 under hand: essentially forbidden
  if (fromF === 5 && toF < 4) {
    return 60
  }

  // Thumb crossing over 5: essentially never happens
  if (fromF === 5 && toF === 1 && interval < 0) {
    return 70
  }

  return 0
}

// ─── 5. Repeated Finger Cost ────────────────────────────────────────
//
// Using the same finger on consecutive different pitches breaks legato
// and is generally avoided except for:
//   - Staccato passages
//   - The same note repeated (where changing fingers is preferred but
//     same finger is acceptable at slow tempos)
//   - Portamento effects (rare in classical piano)
//
// The penalty scales with tempo: fast notes leave less time to lift and
// reposition the same finger, making same-finger reuse harder to execute
// cleanly. Slow passages give the finger plenty of time — same-finger
// reuse becomes a viable choice.

function repeatedFingerCost(ctx: CostContext): number {
  if (!ctx.prevFinger) return 0
  if (ctx.finger !== ctx.prevFinger) return 0

  // Time-scaling factor: fast notes → higher penalty for same-finger reuse.
  // Uses rhythmicSpacing (start-to-start time between consecutive notes).
  const spacing = ctx.note.rhythmicSpacing
  let timeScale = 1.0
  if (spacing !== null) {
    if (spacing < 0.1)        timeScale = 2.5   // very fast: almost impossible to reuse cleanly
    else if (spacing < 0.2)   timeScale = 1.8   // fast: difficult
    else if (spacing < 0.4)   timeScale = 1.0   // moderate: standard penalty
    else if (spacing < 0.8)   timeScale = 0.5   // slow: more acceptable
    else                       timeScale = 0.2   // very slow: barely penalized
  }

  // Same finger on same pitch: acceptable (repeated note)
  if (ctx.prevNote && ctx.note.note.midiNote === ctx.prevNote.note.midiNote) {
    return 5 * timeScale
  }

  // Same finger on different pitch: breaks legato
  const interval = ctx.prevNote
    ? Math.abs(ctx.note.note.midiNote - ctx.prevNote.note.midiNote)
    : 0

  // Very small interval (1-2 semitones): somewhat acceptable, like a slide
  if (interval <= 2) return 15 * timeScale

  // Larger interval: increasingly bad
  return (20 + interval * 3) * timeScale
}

// ─── 6. Thumb on Black Key Cost ─────────────────────────────────────
//
// The thumb is short and thick — pressing an elevated black key forces
// the wrist forward and makes legato crossings harder. This is a strong
// convention in piano fingering.
//
// However, there are legitimate exceptions:
//   - Music primarily on black keys
//   - Chords/octaves spanning black keys
//   - When black key density is high overall

function thumbBlackKeyCost(ctx: CostContext, config: FingeringConfig): number {
  if (ctx.finger !== 1) return 0
  if (!ctx.note.note.isBlackKey) return 0

  // Compact patterns (arpeggios, broken chords ≤ 1 octave): hand is already
  // positioned over the pattern. Black keys are expected and thumb-on-black
  // is normal technique — e.g., LH thumb on F#5 at the top of a G minor arpeggio.
  const isCompactPattern = (ctx.note.patternTags.includes('arpeggio') ||
    ctx.note.patternTags.includes('broken-chord')) &&
    ctx.note.patternSpan !== null && ctx.note.patternSpan > 0 && ctx.note.patternSpan <= 12

  if (isCompactPattern) {
    return 5  // minimal penalty — hand is positioned for the pattern
  }

  // Check if thumb-on-black is justified by chord context
  const chordMidis = ctx.sliceNotes.map((n) => n.note.midiNote)
  const blackKeyDensity = ctx.sliceNotes.filter((n) => n.note.isBlackKey).length /
    Math.max(ctx.sliceNotes.length, 1)

  if (isThumbOnBlackAllowed(ctx.note.note.midiNote, chordMidis, blackKeyDensity)) {
    return 10  // reduced penalty when justified
  }

  return 50  // standard strong penalty
}

// ─── 7. Direction Consistency Cost ──────────────────────────────────
//
// During passages moving consistently in one direction, pianists prefer
// to use a consistent fingering pattern (e.g., 1-2-3-1-2-3-4 ascending).
// This module rewards consistent direction-to-finger mapping.

function directionConsistencyCost(ctx: CostContext): number {
  if (!ctx.prevFinger || !ctx.prevNote) return 0

  const dir = ctx.note.direction
  if (dir === 'same') return 0

  // During ascending motion, fingers should generally increase
  // (lower number → higher number on higher notes)
  // During descending, the opposite
  // This is a soft bias, not a hard rule
  const fingerDiff = ctx.finger - ctx.prevFinger

  if (dir === 'up' && fingerDiff > 0) return -3  // reward consistent pattern
  if (dir === 'down' && fingerDiff < 0) return -3
  if (dir === 'up' && fingerDiff < 0) return 5   // slight penalty for reversing
  if (dir === 'down' && fingerDiff > 0) return 5

  return 0
}

// ─── 8. Pattern Consistency Cost ────────────────────────────────────
//
// Penalizes breaking a recognized pattern. If the optimizer is choosing
// between several options during a scale or arpeggio, this module biases
// toward maintaining a consistent pattern throughout the run.

function patternConsistencyCost(ctx: CostContext): number {
  if (!ctx.prevFinger || !ctx.prevNote) return 0

  const currentTags = ctx.note.patternTags
  const prevTags = ctx.prevNote.patternTags

  // Check if we're in the middle of a recognized pattern
  const sharedPatterns = currentTags.filter((t) =>
    prevTags.includes(t) &&
    (t === 'scale-ascending' || t === 'scale-descending' ||
     t === 'arpeggio' || t === 'broken-chord' ||
     t === 'stepwise-up' || t === 'stepwise-down')
  )

  if (sharedPatterns.length === 0) return 0

  // During patterns, penalize unusual finger transitions
  // (e.g., 2→4 during a scale is non-standard)
  const fromF = ctx.prevFinger
  const toF = ctx.finger

  // Standard scale pattern uses 1-2-3-1-2-3-4
  // Non-adjacent fingers during stepwise motion = pattern break
  const interval = Math.abs(toF - fromF)
  if (interval > 2 && ctx.note.direction !== 'same') {
    return 10  // breaking the pattern
  }

  return 0
}

// ─── 9. Scale Bias Cost ─────────────────────────────────────────────
//
// When a scale pattern is detected, this module applies a negative cost
// (reward) for fingerings that match standard scale fingerings.
//
// Standard RH ascending scale pattern: [1, 2, 3, 1, 2, 3, 4] repeating.
// The pattern depends on the starting note within the scale.

function scaleBiasCost(ctx: CostContext, config: FingeringConfig): number {
  if (!config.enableScaleTemplates) return 0

  const isScale =
    ctx.note.patternTags.includes('scale-ascending') ||
    ctx.note.patternTags.includes('scale-descending')

  if (!isScale) return 0

  // Standard scale fingering: in a group of 7 notes, the pattern is
  // 1-2-3-1-2-3-4 (ascending)
  // For C major scale starting on C:
  //   C(1) D(2) E(3) F(1) G(2) A(3) B(4) C(1)
  // The thumb always plays the 1st and 4th scale degrees (C and F in C major).

  // Since we don't always know the exact scale degree without key signature
  // context, we use a position-based heuristic:
  // In a stepwise run, the preferred finger cycles through 1-2-3-1-2-3-4

  if (ctx.note.patternTags.includes('scale-ascending')) {
    if (ctx.prevFinger === null) {
      // First note of scale: prefer 1 or 2 (scale start fingers)
      return ctx.finger === 1 || ctx.finger === 2 ? -25 : ctx.finger === 3 ? -10 : 0
    }

    // Ascending: after 3 comes 1 (thumb under) — strong reward
    if (ctx.prevFinger === 3 && ctx.finger === 1) return -25
    // After thumb: 1→2, 1→3 are natural
    if (ctx.prevFinger === 1 && ctx.finger === 2) return -20
    if (ctx.prevFinger === 1 && ctx.finger === 3) return -15
    // Sequential: 2→3, 3→4
    if (ctx.prevFinger === 2 && ctx.finger === 3) return -20
    if (ctx.prevFinger === 3 && ctx.finger === 4) return -15
  }

  if (ctx.note.patternTags.includes('scale-descending')) {
    if (ctx.prevFinger === null) {
      // First note of descending scale: prefer 5 or 4
      return ctx.finger === 5 || ctx.finger === 4 ? -25 : ctx.finger === 3 ? -10 : 0
    }

    // Descending: after 1 comes 3 (finger over thumb)
    if (ctx.prevFinger === 1 && ctx.finger === 3) return -25
    if (ctx.prevFinger === 1 && ctx.finger === 4) return -20
    // Sequential descending
    if (ctx.prevFinger === 4 && ctx.finger === 3) return -20
    if (ctx.prevFinger === 3 && ctx.finger === 2) return -20
    if (ctx.prevFinger === 2 && ctx.finger === 1) return -15
    if (ctx.prevFinger === 3 && ctx.finger === 1) return -25
  }

  return 0
}

// ─── 10. Arpeggio Bias Cost ─────────────────────────────────────────
//
// When an arpeggio pattern is detected, biases toward standard arpeggio
// fingerings. Root-position arpeggios use 1-2-3-1-2-3-5 (RH) or
// 5-4-2-1-4-2-1 (LH) patterns.
//
// Special case: 1-octave arpeggios (span ≤ 12) use chord-like fingering.
// Each note gets the same finger it would have if the arpeggio were
// played as a block chord. The hand stays in one position.

function arpeggioBiasCost(ctx: CostContext, config: FingeringConfig): number {
  if (!config.enableArpeggioTemplates) return 0

  const isArpeggio = ctx.note.patternTags.includes('arpeggio')
  const isBrokenChord = ctx.note.patternTags.includes('broken-chord')
  if (!isArpeggio && !isBrokenChord) return 0

  // ── Compact pattern (≤ 1 octave): chord-like fingering ───────
  // Map note position within the span to a finger, same as a block chord.
  // Applies to both arpeggios and broken chords — any sequential pattern
  // spanning ≤ 12 semitones where hand stays in one position.
  const span = ctx.note.patternSpan
  const minNote = ctx.note.patternMinNote
  if (span !== null && minNote !== null && span > 0 && span <= 12) {
    const notePitch = ctx.note.note.midiNote
    // Proportional position: 0.0 = lowest, 1.0 = highest
    const position = (notePitch - minNote) / span

    // Map to finger 1-5 (RH: 1=lowest, 5=highest; LH: 5=lowest, 1=highest)
    let idealFinger: Finger
    if (ctx.hand === 'right') {
      idealFinger = clampFinger(1 + Math.round(position * 4))
    } else {
      idealFinger = clampFinger(5 - Math.round(position * 4))
    }

    if (ctx.finger === idealFinger) {
      // Exact match: dominant reward. Must survive beam pruning against
      // accumulated transition penalties from suboptimal previous fingers.
      // At -200 × 25 weight = -5000, this dominates any single-transition cost.
      return -200
    }
    // Near match (off by 1): significant reward
    if (Math.abs(ctx.finger - idealFinger) === 1) {
      return -40
    }
    // Wrong finger: penalize deviation
    return Math.abs(ctx.finger - idealFinger) * 40
  }

  // ── Larger arpeggios: standard crossing pattern ──────────────
  // Standard triadic arpeggio pattern (ascending): 1-2-3-1-2-3-5
  if (ctx.prevFinger === null) {
    return ctx.finger === 1 ? -25 : ctx.finger === 2 ? -15 : 0
  }

  // Ascending: after 3 → 1 (thumb under) — strong reward
  if (ctx.prevFinger === 3 && ctx.finger === 1) return -30
  // Sequential: 1→2, 2→3
  if (ctx.prevFinger === 1 && ctx.finger === 2) return -20
  if (ctx.prevFinger === 2 && ctx.finger === 3) return -20
  // 1→4 is also acceptable in some arpeggio fingerings
  if (ctx.prevFinger === 1 && ctx.finger === 4) return -10

  return 0
}

/** Clamp a finger position to the valid 1-5 range. */
function clampFinger(f: number): Finger {
  return Math.max(1, Math.min(5, Math.round(f))) as Finger
}

// ─── 11. Leap Recovery Cost ─────────────────────────────────────────
//
// After a large melodic leap, the hand effectively resets its position.
// The previous hand position becomes less relevant — the optimizer should
// not penalize a hand shift that was forced by the music.
//
// This module detects when the PREVIOUS note was a large leap and
// reduces the influence of the pre-leap hand position on the current
// transition cost by applying a negative offset.

function leapRecoveryCost(ctx: CostContext, _config: FingeringConfig): number {
  if (!ctx.prevNote) return 0

  const isLeap = ctx.prevNote.patternTags.includes('large-leap')
  if (!isLeap) return 0

  // After a large leap, the hand is "free" — reduce accumulated
  // hand-position penalties
  return -20 // negative cost = effectively reduces other hand-shift costs
}

// ─── 12. Phrase Boundary Cost ───────────────────────────────────────
//
// Phrase endings are natural places to reposition the hand.
// This module reduces repositioning penalties at phrase boundaries
// and lightly penalizes large hand movements mid-phrase.

function phraseBoundaryCost(ctx: CostContext): number {
  if (ctx.isPhraseStart) {
    // At phrase start, hand can be anywhere — no penalty for being
    // in a different position than the end of the previous phrase
    return -15
  }

  if (ctx.isPhraseEnd && ctx.prevHandState) {
    // At phrase end, allow the hand to prepare for the next phrase
    return -5
  }

  return 0
}

// ─── 13. Chord Comfort Cost ─────────────────────────────────────────
//
// Evaluates comfort of a chord fingering. Used by the chord optimizer
// to score candidate fingerings.
//
// This module is called once per chord candidate (not per transition).
// It checks: total span, finger assignments matching note positions,
// thumb on black key, and evenness of finger distribution.

function chordComfortCost(ctx: CostContext, _config: FingeringConfig): number {
  if (ctx.sliceNotes.length <= 1) return 0

  let cost = 0

  // Check thumb on black key for chord notes
  if (ctx.finger === 1 && ctx.note.note.isBlackKey) {
    // In chords, thumb on black key is more acceptable
    // but still suboptimal for the lowest note
    const isLowestNote = ctx.sliceNotes.length > 0 &&
      ctx.note.note.midiNote === ctx.sliceNotes[0]!.note.midiNote
    cost += isLowestNote ? 15 : 5
  }

  // Ring finger (4) on black key is actually preferred in many cases
  // No penalty for 4 on black

  // Pinky on black in chords: acceptable
  // No penalty

  return cost
}

// ─── Chord Fingering Evaluation ─────────────────────────────────────

/**
 * Evaluate comfort of a complete chord fingering. Called during chord
 * optimization to score each candidate finger combination.
 *
 * @param sortedMidis - MIDI notes of the chord, sorted low→high
 * @param fingers - Finger assignments, same order as sortedMidis
 * @param config - Engine configuration
 * @returns Comfort cost (lower = more comfortable)
 */
export function evaluateChordFingering(
  sortedMidis: readonly number[],
  fingers: readonly Finger[],
  hand: Hand,
  config: FingeringConfig,
): number {
  let cost = 0

  // 1. Check total span is reachable
  if (sortedMidis.length >= 2) {
    const span = sortedMidis[sortedMidis.length - 1]! - sortedMidis[0]!
    if (span > config.chordMaxSpan) return Infinity
    if (span > config.comfortableSpan) {
      cost += (span - config.comfortableSpan) * 5
    }
  }

  // 2. Check each finger pair is comfortable
  for (let i = 0; i < sortedMidis.length - 1; i++) {
    const fromF = fingers[i]!
    const toF = fingers[i + 1]!
    const interval = sortedMidis[i + 1]! - sortedMidis[i]!

    if (!isIntervalPossible(fromF, toF, interval)) return Infinity

    const pairData = getFingerPairInterval(fromF, toF)
    if (interval > pairData.maxComfortable) {
      cost += (interval - pairData.maxComfortable) * 8
    }
    if (interval < pairData.minComfortable) {
      cost += (pairData.minComfortable - interval) * 5 // cramped
    }
  }

  // 3. Check thumb on black key
  for (let i = 0; i < sortedMidis.length; i++) {
    const midi = sortedMidis[i]!
    const finger = fingers[i]!
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12)

    if (finger === 1 && isBlack) {
      // More acceptable in chords but still suboptimal
      const blackKeyDensity = sortedMidis.filter((m) => [1, 3, 6, 8, 10].includes(m % 12)).length /
        sortedMidis.length
      if (!isThumbOnBlackAllowed(midi, sortedMidis, blackKeyDensity)) {
        cost += 30
      } else {
        cost += 8
      }
    }
  }

  // 4. Reward even finger spacing (no gaps)
  // If fingers are 1-2-3-4 or 1-2-3-5, that's natural
  const fingerSet = new Set(fingers)
  const expectedFingers = sortedMidis.length
  if (fingerSet.size === expectedFingers) {
    // All different fingers = good
    cost -= 5
  }

  // 5. Wide-chord spread bias: for chords spanning 5+ semitones,
  // strongly prefer thumb (1) on lowest and pinky (5) on highest.
  // Bunched fingers (e.g., 1-3 on an octave) are uncomfortable.
  const pitchSpan = sortedMidis.length >= 2
    ? sortedMidis[sortedMidis.length - 1]! - sortedMidis[0]!
    : 0
  const fingerSpan = fingers[fingers.length - 1]! - fingers[0]!

  // Ideal: ~2.5 semitones of pitch span per finger "unit" (1-5 = 4 units)
  const idealFingerSpan = Math.min(4, Math.ceil(pitchSpan / 2.5))
  if (fingerSpan < idealFingerSpan) {
    // Fingers are bunched relative to the pitch spread — penalize
    cost += (idealFingerSpan - fingerSpan) * 20
  }

  // Bonus for using extreme fingers (1 and 5) on wide chords
  // This ensures octaves and near-octaves naturally use 1-5
  if (pitchSpan >= 8 && fingers[0] === 1 && fingers[fingers.length - 1] === 5) {
    cost -= 20  // strong preference for 1-5 on wide spans
  }

  return cost
}
