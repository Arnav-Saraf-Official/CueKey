/**
 * Piano Fingering Engine — Core Types
 *
 * All types used across the fingering system. Designed for immutability —
 * every interface uses `readonly` so data flows one way through the pipeline:
 *   SongNote → RichNote → AnalyzedNote → TimeSlice → FingerAssignment
 */

// ─── Configuration ──────────────────────────────────────────────────

/**
 * Complete configuration for the fingering engine.
 * Every weight, threshold, and limit. Tune these to adjust behavior.
 */
export interface FingeringConfig {
  readonly beamWidth: number
  readonly maxHandSpan: number
  readonly comfortableSpan: number
  readonly minHandSpan: number
  readonly fingerTransitionWeight: number
  readonly stretchWeight: number
  readonly handShiftWeight: number
  readonly fingerCrossingWeight: number
  readonly repeatedFingerWeight: number
  readonly thumbBlackKeyWeight: number
  readonly directionConsistencyWeight: number
  readonly patternConsistencyWeight: number
  readonly scaleBiasWeight: number
  readonly arpeggioBiasWeight: number
  readonly leapRecoveryWeight: number
  readonly phraseBoundaryWeight: number
  readonly chordComfortWeight: number
  readonly stepwiseMaxInterval: number
  readonly chromaticMinRun: number
  readonly arpeggioMinSpan: number
  readonly brokenChordMaxInterval: number
  readonly repeatedNoteTimeWindow: number
  readonly largeLeapMinInterval: number
  readonly accompanimentRepetitionWindow: number
  readonly phraseBoundaryMinRest: number
  readonly phraseBoundaryMinLength: number
  readonly maxChordNotes: number
  readonly chordMaxSpan: number
  readonly enableScaleTemplates: boolean
  readonly enableArpeggioTemplates: boolean
  readonly chordWindow: number
  readonly enableDebug: boolean
}

// ─── Fingers & Hands ────────────────────────────────────────────────

/** Piano finger number, standard 1-5 numbering (1 = thumb, 5 = pinky). */
export type Finger = 1 | 2 | 3 | 4 | 5

/** All five fingers, ordered thumb→pinky. */
export const ALL_FINGERS: readonly Finger[] = [1, 2, 3, 4, 5]

/** Which hand. */
export type Hand = 'left' | 'right'

// ─── Immutable Note (parsed from SongNote) ──────────────────────────

/**
 * A rich, immutable note object derived from a SongNote.
 * The rest of the fingering system never works with raw MIDI events —
 * it only consumes RichNote instances.
 */
export interface RichNote {
  /** Index into the original Song.notes array. */
  readonly index: number
  /** MIDI note number (0–127). Middle C = 60. */
  readonly midiNote: number
  /** Pitch class 0–11, where 0 = C. */
  readonly pitchClass: number
  /** Octave number. Middle C is in octave 4. */
  readonly octave: number
  /** Start time in seconds from song beginning. */
  readonly startTime: number
  /** End time in seconds. */
  readonly endTime: number
  /** Duration in seconds. */
  readonly duration: number
  /** MIDI velocity 0–127. */
  readonly velocity: number
  /** Track number (0-indexed track index in the MIDI file). */
  readonly track: number
  /** Measure number (1-indexed). */
  readonly measure: number
  /** True if this note is a black key. */
  readonly isBlackKey: boolean
  /** True if this note is a white key. */
  readonly isWhiteKey: boolean
  /** Letter name: 'C', 'D', 'E', 'F', 'G', 'A', 'B'. */
  readonly step: string
  /** Alteration: -1 = flat, 0 = natural, 1 = sharp. */
  readonly alter: number
}

// ─── Context Analysis ───────────────────────────────────────────────

/** Direction of melodic motion. */
export type MelodicDirection = 'up' | 'down' | 'same' | 'neutral'

/** Kinds of musical patterns the recognizer can detect. */
export type PatternTag =
  | 'stepwise-up'
  | 'stepwise-down'
  | 'scale-ascending'
  | 'scale-descending'
  | 'chromatic-up'
  | 'chromatic-down'
  | 'broken-chord'
  | 'arpeggio'
  | 'repeated-note'
  | 'tremolo'
  | 'large-leap'
  | 'accompaniment-figure'
  | 'melodic-motif'

/**
 * A note annotated with musical context — the output of the context
 * analysis and pattern recognition phases. This is what the optimizer
 * consumes as input.
 */
export interface AnalyzedNote {
  /** The underlying rich note. */
  readonly note: RichNote
  /** Previous note in the same hand's sequence, or null if first. */
  readonly previousNote: RichNote | null
  /** Next note in the same hand's sequence, or null if last. */
  readonly nextNote: RichNote | null
  /** Semitone interval from previous note (null if first note). */
  readonly melodicInterval: number | null
  /** Time in seconds since previous note's start (null if first). */
  readonly rhythmicSpacing: number | null
  /** Direction from previous note. */
  readonly direction: MelodicDirection
  /** True if this note is part of a multi-note time slice. */
  readonly isChordNote: boolean
  /** All notes in the same time slice (includes this note). */
  readonly chordNotes: readonly RichNote[]
  /** True if same pitch as the immediately preceding note. */
  readonly isRepeated: boolean
  /** Detected pattern tags. Mutable — populated by the pattern recognizer after context analysis. */
  patternTags: PatternTag[]
  /**
   * Total semitone span of the enclosing pattern (if any).
   * Set during pattern detection. Used by cost modules to scale bias strength.
   * E.g., a 1-octave arpeggio (span ≤ 12) gets chord-like fingering.
   */
  patternSpan: number | null
  /**
   * Lowest MIDI note in the enclosing pattern (if any).
   * Used with patternSpan to compute proportional finger position.
   */
  patternMinNote: number | null
  /** True if this note begins a new musical phrase. */
  readonly isPhraseStart: boolean
  /** True if this note ends a musical phrase. */
  readonly isPhraseEnd: boolean
  /** Local note density: how many notes per second in the surrounding window. */
  readonly localDensity: number
}

// ─── Time Slices ────────────────────────────────────────────────────

/**
 * A group of notes that occur at (roughly) the same time.
 * Single-note slices are the common case; multi-note slices are chords.
 * The optimizer treats each slice as one "step" in the DP.
 */
export interface TimeSlice {
  /** The notes in this slice, sorted low→high by pitch. */
  readonly notes: readonly AnalyzedNote[]
  /** Start time of the slice (earliest note's startTime). */
  readonly startTime: number
  /** End time of the slice (latest note's endTime). */
  readonly endTime: number
  /** Hand this slice belongs to. */
  readonly hand: Hand
}

// ─── Hand Model ─────────────────────────────────────────────────────

/**
 * Estimated state of the hand during optimization.
 * The optimizer tracks where the hand "rests" and uses this to evaluate
 * transition quality rather than considering only finger-to-finger jumps.
 */
export interface HandState {
  /** MIDI note where the thumb would naturally rest. */
  readonly thumbPosition: number
  /** MIDI note at the center of the hand (~where finger 3 would rest). */
  readonly handCenter: number
  /** Maximum comfortable span from this position (semitones). */
  readonly comfortableSpan: number
  /** Direction the hand has been moving. */
  readonly direction: MelodicDirection
}

// ─── Cost Breakdown ─────────────────────────────────────────────────

/** Per-module cost breakdown for a single transition decision. */
export interface CostBreakdown {
  readonly fingerTransition: number
  readonly stretch: number
  readonly handShift: number
  readonly fingerCrossing: number
  readonly repeatedFinger: number
  readonly thumbBlackKey: number
  readonly directionConsistency: number
  readonly patternConsistency: number
  readonly scaleBias: number
  readonly arpeggioBias: number
  readonly leapRecovery: number
  readonly phraseBoundary: number
  readonly chordComfort: number
  /** Sum of all enabled cost modules. */
  readonly total: number
}

/** A zero-cost breakdown, used as the initial state. */
export const ZERO_COST: CostBreakdown = Object.freeze({
  fingerTransition: 0,
  stretch: 0,
  handShift: 0,
  fingerCrossing: 0,
  repeatedFinger: 0,
  thumbBlackKey: 0,
  directionConsistency: 0,
  patternConsistency: 0,
  scaleBias: 0,
  arpeggioBias: 0,
  leapRecovery: 0,
  phraseBoundary: 0,
  chordComfort: 0,
  total: 0,
})

// ─── Optimization State ─────────────────────────────────────────────

/**
 * A single state in the Viterbi beam search.
 * Represents "at note index N, we used finger F with hand position H
 * and accumulated total cost C."
 */
export interface ViterbiState {
  /** Index into the TimeSlice array (not the original Song.notes). */
  readonly sliceIndex: number
  /**
   * Finger assignments for this slice.
   * For single-note slices, one entry. For chords, one per note.
   */
  readonly assignments: ReadonlyMap<number, Finger>
  /** Estimated hand state after playing this slice. */
  readonly handState: HandState
  /** Accumulated total cost from the start of the phrase. */
  readonly accumulatedCost: number
  /** Cost breakdown for the transition into this state. */
  readonly costBreakdown: CostBreakdown
  /** Pointer to the previous state in the optimal path. */
  readonly prev: ViterbiState | null
}

// ─── Finger Decision (per-note debug output) ────────────────────────

/** Alternative candidate that was considered but rejected. */
export interface FingerCandidate {
  readonly finger: Finger
  readonly cost: number
  readonly costBreakdown: CostBreakdown
  readonly reason: string
}

/**
 * Final fingering decision for a single note.
 * Contains the chosen finger plus debugging information about alternatives.
 */
export interface FingerDecision {
  readonly noteIndex: number
  readonly midiNote: number
  readonly finger: Finger
  readonly hand: Hand
  readonly handPosition: number
  readonly cost: number
  readonly costBreakdown: CostBreakdown
  readonly alternatives: readonly FingerCandidate[]
  readonly patternTags: readonly PatternTag[]
}

// ─── Complete Result ────────────────────────────────────────────────

/** Statistics about a completed fingering run. */
export interface FingeringStats {
  readonly totalNotes: number
  readonly totalChords: number
  readonly totalPhrases: number
  readonly avgCostPerNote: number
  readonly optimizationTimeMs: number
  readonly patternCounts: Partial<Record<PatternTag, number>>
}

/**
 * The complete output of the fingering engine.
 * Compatible with the existing Player's `handMap` / `fingerMap` interface
 * for drop-in replacement.
 */
export interface FingeringResult {
  /** Note index → hand assignment. */
  readonly handMap: Map<number, Hand>
  /** Note index → finger (1–5). */
  readonly fingerMap: Map<number, Finger>
  /** Per-note debug information (only populated when debug is enabled). */
  readonly decisions: readonly FingerDecision[]
  /** Aggregate statistics. */
  readonly stats: FingeringStats
}

// ─── Chord Candidate ────────────────────────────────────────────────

/** A candidate fingering for a chord (multi-note time slice). */
export interface ChordCandidate {
  /** Finger assignments: noteIndex → finger, sorted low→high by pitch. */
  readonly assignments: ReadonlyMap<number, Finger>
  /** Comfort score for this chord (lower = more comfortable). */
  readonly comfortCost: number
  /** Estimated hand state after playing this chord. */
  readonly handState: HandState
}
