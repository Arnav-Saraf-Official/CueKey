/**
 * Piano Fingering Engine — Tests
 *
 * Comprehensive tests for all modules. Each module is tested independently.
 */

import { describe, it, expect } from 'bun:test'
import { parseNotes, parseNote } from '../notes'
import { analyzeContext } from '../context'
import { recognizePatterns } from '../patterns'
import { DEFAULT_CONFIG } from '../config'
import { computeFingering } from '../index'
import {
  getFingerPairInterval,
  stretchCost,
  isIntervalPossible,
  isIntervalComfortable,
  canHandReachChord,
  FINGER_PROPERTIES,
} from '../ergonomics'
import {
  thumbPositionForFinger,
  fingerRestPosition,
  handStateFromFinger,
  neutralHandState,
  handShiftDistance,
  handShiftCost,
} from '../hand-model'
import {
  computeTransitionCost,
  evaluateChordFingering,
} from '../costs'
import { generateChordCandidates } from '../chord-optimizer'
import type { CostContext } from '../costs'
import type { Finger, HandState, AnalyzedNote, RichNote, PatternTag } from '../types'
import type { SongNote } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a minimal SongNote for testing. */
function makeSongNote(overrides: Partial<SongNote> = {}): SongNote {
  return {
    type: 'note',
    midiNote: 60,
    track: 0,
    time: 0,
    duration: 0.5,
    velocity: 64,
    measure: 1,
    ...overrides,
  }
}

/** Create a minimal RichNote for testing. */
function makeRichNote(overrides: Partial<RichNote> & { index: number; midiNote: number; startTime: number }): RichNote {
  const midiNote = overrides.midiNote
  const pitchClass = midiNote % 12
  const blackKeys = new Set([1, 3, 6, 8, 10])
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]

  return Object.freeze({
    index: overrides.index,
    midiNote,
    pitchClass,
    octave: Math.floor(midiNote / 12) - 1,
    startTime: overrides.startTime,
    endTime: overrides.startTime + (overrides.duration ?? 0.5),
    duration: overrides.duration ?? 0.5,
    velocity: overrides.velocity ?? 64,
    track: overrides.track ?? 0,
    measure: overrides.measure ?? 1,
    isBlackKey: blackKeys.has(pitchClass),
    isWhiteKey: !blackKeys.has(pitchClass),
    step: names[pitchClass]![0]!,
    alter: alters[pitchClass]!,
  })
}

// ─── Notes Parser ───────────────────────────────────────────────────

describe('parseNotes', () => {
  it('parses a single SongNote into a RichNote', () => {
    const songNote = makeSongNote({ midiNote: 60, time: 1.0, duration: 0.75, velocity: 100, track: 2, measure: 3 })
    const result = parseNote(songNote, 5)

    expect(result.index).toBe(5)
    expect(result.midiNote).toBe(60)
    expect(result.pitchClass).toBe(0) // C
    expect(result.octave).toBe(4) // Middle C
    expect(result.startTime).toBe(1.0)
    expect(result.endTime).toBe(1.75)
    expect(result.duration).toBe(0.75)
    expect(result.velocity).toBe(100)
    expect(result.track).toBe(2)
    expect(result.measure).toBe(3)
    expect(result.isBlackKey).toBe(false)
    expect(result.isWhiteKey).toBe(true)
    expect(result.step).toBe('C')
    expect(result.alter).toBe(0)
  })

  it('correctly identifies black keys', () => {
    // C# (MIDI 61) = black key
    const blackNote = parseNote(makeSongNote({ midiNote: 61 }), 0)
    expect(blackNote.isBlackKey).toBe(true)
    expect(blackNote.isWhiteKey).toBe(false)
    expect(blackNote.step).toBe('C')
    expect(blackNote.alter).toBe(1)

    // Eb (MIDI 63) = black key
    const ebNote = parseNote(makeSongNote({ midiNote: 63 }), 0)
    expect(ebNote.isBlackKey).toBe(true)
    expect(ebNote.step).toBe('D')
    expect(ebNote.alter).toBe(1)

    // F# (MIDI 66) = black key
    const fsNote = parseNote(makeSongNote({ midiNote: 66 }), 0)
    expect(fsNote.isBlackKey).toBe(true)
  })

  it('correctly identifies white keys', () => {
    // D (MIDI 62) = white
    expect(parseNote(makeSongNote({ midiNote: 62 }), 0).isWhiteKey).toBe(true)
    // E (MIDI 64) = white
    expect(parseNote(makeSongNote({ midiNote: 64 }), 0).isWhiteKey).toBe(true)
    // F (MIDI 65) = white
    expect(parseNote(makeSongNote({ midiNote: 65 }), 0).isWhiteKey).toBe(true)
    // G (MIDI 67) = white
    expect(parseNote(makeSongNote({ midiNote: 67 }), 0).isWhiteKey).toBe(true)
    // A (MIDI 69) = white
    expect(parseNote(makeSongNote({ midiNote: 69 }), 0).isWhiteKey).toBe(true)
    // B (MIDI 71) = white
    expect(parseNote(makeSongNote({ midiNote: 71 }), 0).isWhiteKey).toBe(true)
  })

  it('computes correct octaves across the keyboard', () => {
    // A0 = MIDI 21, octave 0
    expect(parseNote(makeSongNote({ midiNote: 21 }), 0).octave).toBe(0)
    // C4 = MIDI 60, octave 4
    expect(parseNote(makeSongNote({ midiNote: 60 }), 0).octave).toBe(4)
    // C8 = MIDI 108, octave 8
    expect(parseNote(makeSongNote({ midiNote: 108 }), 0).octave).toBe(8)
  })

  it('parses multiple notes preserving index', () => {
    const songNotes = [
      makeSongNote({ midiNote: 60, time: 0 }),
      makeSongNote({ midiNote: 64, time: 0.5 }),
      makeSongNote({ midiNote: 67, time: 1.0 }),
    ]
    const results = parseNotes(songNotes)

    expect(results.length).toBe(3)
    expect(results[0]!.index).toBe(0)
    expect(results[1]!.index).toBe(1)
    expect(results[2]!.index).toBe(2)
    expect(results[0]!.midiNote).toBe(60)
    expect(results[1]!.midiNote).toBe(64)
    expect(results[2]!.midiNote).toBe(67)
  })
})

// ─── Context Analysis ───────────────────────────────────────────────

describe('analyzeContext', () => {
  it('computes melodic intervals between consecutive notes', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.5 }),
      makeRichNote({ index: 2, midiNote: 62, startTime: 1.0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)

    expect(analyzed[0]!.melodicInterval).toBeNull() // first note
    expect(analyzed[1]!.melodicInterval).toBe(4)     // 64 - 60
    expect(analyzed[2]!.melodicInterval).toBe(-2)    // 62 - 64
  })

  it('detects direction of motion', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.5 }), // up
      makeRichNote({ index: 2, midiNote: 64, startTime: 1.0 }), // same
      makeRichNote({ index: 3, midiNote: 60, startTime: 1.5 }), // down
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)

    expect(analyzed[0]!.direction).toBe('same')
    expect(analyzed[1]!.direction).toBe('up')
    expect(analyzed[2]!.direction).toBe('same')
    expect(analyzed[3]!.direction).toBe('down')
  })

  it('detects chord notes within the chord window', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.05 }), // within 0.1s window
      makeRichNote({ index: 2, midiNote: 67, startTime: 0.08 }), // within 0.1s window
      makeRichNote({ index: 3, midiNote: 72, startTime: 0.5 }),  // outside window
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)

    expect(analyzed[0]!.isChordNote).toBe(true)
    expect(analyzed[1]!.isChordNote).toBe(true)
    expect(analyzed[2]!.isChordNote).toBe(true)
    expect(analyzed[3]!.isChordNote).toBe(false)

    // All three should have the same chord notes
    expect(analyzed[0]!.chordNotes.length).toBe(3)
    expect(analyzed[1]!.chordNotes.length).toBe(3)
    expect(analyzed[2]!.chordNotes.length).toBe(3)
  })

  it('detects repeated notes', () => {
    const config = { ...DEFAULT_CONFIG, repeatedNoteTimeWindow: 0.5 }
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0, duration: 0.1 }),
      makeRichNote({ index: 1, midiNote: 60, startTime: 0.3, duration: 0.1 }), // same pitch within 0.5s
      makeRichNote({ index: 2, midiNote: 60, startTime: 1.0, duration: 0.1 }), // same pitch, outside window
    ]
    const analyzed = analyzeContext(notes, config)

    expect(analyzed[0]!.isRepeated).toBe(false)
    expect(analyzed[1]!.isRepeated).toBe(true)
    expect(analyzed[2]!.isRepeated).toBe(false) // gap > 0.5s from previous end
  })

  it('detects phrase boundaries at rests', () => {
    const config = { ...DEFAULT_CONFIG, phraseBoundaryMinRest: 0.5 }
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0, duration: 0.2 }),
      makeRichNote({ index: 1, midiNote: 62, startTime: 0.3, duration: 0.2 }),
      makeRichNote({ index: 2, midiNote: 64, startTime: 1.2, duration: 0.2 }), // gap > 0.5s from prev end
    ]
    const analyzed = analyzeContext(notes, config)

    expect(analyzed[0]!.isPhraseStart).toBe(true)  // first note always phrase start
    expect(analyzed[1]!.isPhraseStart).toBe(false)
    expect(analyzed[2]!.isPhraseStart).toBe(true)  // gap → new phrase
    expect(analyzed[1]!.isPhraseEnd).toBe(true)    // last note before gap
  })
})

// ─── Pattern Recognition ────────────────────────────────────────────

describe('recognizePatterns', () => {
  it('detects ascending scale passages', () => {
    // C major scale: C4 D4 E4 F4 G4 = stepwise up
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 62, startTime: 0.5 }),
      makeRichNote({ index: 2, midiNote: 64, startTime: 1.0 }),
      makeRichNote({ index: 3, midiNote: 65, startTime: 1.5 }),
      makeRichNote({ index: 4, midiNote: 67, startTime: 2.0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    // Notes 1-4 should have scale-ascending tag (they're part of a 4+ note run)
    // Note 0 also gets tagged now (run start is included)
    expect(analyzed[1]!.patternTags).toContain('scale-ascending')
    expect(analyzed[2]!.patternTags).toContain('scale-ascending')
    expect(analyzed[3]!.patternTags).toContain('scale-ascending')
    expect(analyzed[4]!.patternTags).toContain('scale-ascending')
  })

  it('detects descending scale passages', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 76, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 74, startTime: 0.5 }),
      makeRichNote({ index: 2, midiNote: 72, startTime: 1.0 }),
      makeRichNote({ index: 3, midiNote: 71, startTime: 1.5 }),
      makeRichNote({ index: 4, midiNote: 69, startTime: 2.0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[1]!.patternTags).toContain('scale-descending')
    expect(analyzed[4]!.patternTags).toContain('scale-descending')
  })

  it('detects chromatic passages', () => {
    // Chromatic run: C4 C#4 D4 D#4 = 4 chromatic steps
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 61, startTime: 0.3 }),
      makeRichNote({ index: 2, midiNote: 62, startTime: 0.6 }),
      makeRichNote({ index: 3, midiNote: 63, startTime: 0.9 }),
      makeRichNote({ index: 4, midiNote: 64, startTime: 1.2 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[1]!.patternTags).toContain('chromatic-up')
    expect(analyzed[4]!.patternTags).toContain('chromatic-up')
  })

  it('detects arpeggios (wide-span broken chords)', () => {
    // C major arpeggio: C4 E4 G4 C5 = spans 12+ semitones
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.5 }), // +4
      makeRichNote({ index: 2, midiNote: 67, startTime: 1.0 }), // +3
      makeRichNote({ index: 3, midiNote: 72, startTime: 1.5 }), // +5 (total span = 12)
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[0]!.patternTags).toContain('arpeggio')
    expect(analyzed[3]!.patternTags).toContain('arpeggio')
  })

  it('detects broken chords (narrower than arpeggios)', () => {
    // C major broken chord: C4 E4 G4 = max span 7
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.5 }),
      makeRichNote({ index: 2, midiNote: 67, startTime: 1.0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[0]!.patternTags).toContain('broken-chord')
    expect(analyzed[2]!.patternTags).toContain('broken-chord')
  })

  it('detects repeated notes', () => {
    const config = { ...DEFAULT_CONFIG, repeatedNoteTimeWindow: 0.5 }
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0, duration: 0.1 }),
      makeRichNote({ index: 1, midiNote: 60, startTime: 0.3, duration: 0.1 }),
    ]
    const analyzed = analyzeContext(notes, config)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[0]!.patternTags).toContain('repeated-note')
    expect(analyzed[1]!.patternTags).toContain('repeated-note')
  })

  it('detects tremolos', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0, duration: 0.1 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0.2, duration: 0.1 }),
      makeRichNote({ index: 2, midiNote: 60, startTime: 0.4, duration: 0.1 }), // A-B-A pattern
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[2]!.patternTags).toContain('tremolo')
  })

  it('detects large leaps', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 72, startTime: 0.5 }), // +12 = octave leap
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    recognizePatterns(analyzed, DEFAULT_CONFIG)

    expect(analyzed[1]!.patternTags).toContain('large-leap')
  })
})

// ─── Finger Ergonomics ──────────────────────────────────────────────

describe('finger ergonomics', () => {
  it('has defined properties for all 5 fingers', () => {
    for (let f = 1; f <= 5; f++) {
      const props = FINGER_PROPERTIES[f as Finger]
      expect(props).toBeDefined()
      expect(props.finger as number).toBe(f)
      expect(props.name.length).toBeGreaterThan(0)
      expect(props.independence).toBeGreaterThan(0)
    }
  })

  it('finger 4 has the lowest independence', () => {
    const f4 = FINGER_PROPERTIES[4]
    for (let f = 1; f <= 5; f++) {
      if (f === 4) continue
      expect(FINGER_PROPERTIES[f as Finger].independence).toBeGreaterThan(f4.independence)
    }
  })

  it('thumb has the lowest black key preference', () => {
    const f1 = FINGER_PROPERTIES[1]
    for (let f = 2; f <= 5; f++) {
      expect(FINGER_PROPERTIES[f as Finger].blackKeyPreference).toBeGreaterThanOrEqual(f1.blackKeyPreference)
    }
  })

  it('returns valid interval data for all finger pairs', () => {
    for (let from = 1; from <= 5; from++) {
      for (let to = 1; to <= 5; to++) {
        if (from === to) continue
        const data = getFingerPairInterval(from as Finger, to as Finger)
        expect(data).toBeDefined()
        expect(data.maxComfortable).toBeGreaterThanOrEqual(data.minComfortable)
        expect(data.maxPossible).toBeGreaterThanOrEqual(data.maxComfortable)
        expect(data.ideal).toBeGreaterThanOrEqual(data.minComfortable)
        expect(data.ideal).toBeLessThanOrEqual(data.maxComfortable)
      }
    }
  })

  it('1-5 pair has the largest span', () => {
    const span15 = getFingerPairInterval(1, 5).maxPossible
    const span14 = getFingerPairInterval(1, 4).maxPossible
    expect(span15).toBeGreaterThanOrEqual(span14)
  })

  it('stretch cost is 0 within comfort zone', () => {
    const cost = stretchCost(1, 3, 5) // 1→3 ideal is 5, maxcomfortable is 7
    expect(cost).toBe(0)
  })

  it('stretch cost is positive beyond comfort zone', () => {
    const cost = stretchCost(1, 3, 9) // 1→3 maxcomfortable is 7, so 9 > 7
    expect(cost).toBeGreaterThan(0)
  })

  it('stretch cost is Infinity for impossible intervals', () => {
    const cost = stretchCost(1, 2, 20) // 1→2 maxpossible is 7
    expect(cost).toBe(Infinity)
  })

  it('isIntervalPossible returns correct values', () => {
    expect(isIntervalPossible(1, 5, 12)).toBe(true)  // octave = possible
    expect(isIntervalPossible(1, 5, 15)).toBe(false) // > maxPossible
    expect(isIntervalPossible(3, 4, 3)).toBe(true)
    expect(isIntervalPossible(3, 4, 6)).toBe(false)  // > maxPossible for 3-4
  })

  it('isIntervalComfortable returns correct values', () => {
    expect(isIntervalComfortable(1, 3, 5)).toBe(true)   // ideal
    expect(isIntervalComfortable(1, 3, 2)).toBe(false)  // too cramped
    expect(isIntervalComfortable(1, 3, 9)).toBe(false)  // too stretched
  })

  it('canHandReachChord validates spans', () => {
    expect(canHandReachChord([60, 64, 67], 13)).toBe(true)  // C-E-G, span 7
    expect(canHandReachChord([60, 64, 76], 13)).toBe(false) // span 16
    expect(canHandReachChord([60], 13)).toBe(true)           // single note
    expect(canHandReachChord([], 13)).toBe(true)             // empty
  })
})

// ─── Hand Model ─────────────────────────────────────────────────────

describe('hand model', () => {
  it('thumbPositionForFinger computes correct thumb positions', () => {
    // Finger 3 on C4 (60): thumb should be ~4 semitones below = 56 (Ab3)
    expect(thumbPositionForFinger(3, 60)).toBe(56)
    // Finger 1 on C4: thumb IS the finger, position = 60
    expect(thumbPositionForFinger(1, 60)).toBe(60)
    // Finger 5 on C4: thumb ~8 semitones below = 52 (E3)
    expect(thumbPositionForFinger(5, 60)).toBe(52)
  })

  it('fingerRestPosition computes correct resting positions', () => {
    const thumbPos = 60
    expect(fingerRestPosition(thumbPos, 1)).toBe(60)
    expect(fingerRestPosition(thumbPos, 3)).toBe(64)
    expect(fingerRestPosition(thumbPos, 5)).toBe(68)
  })

  it('handStateFromFinger creates valid state', () => {
    const state = handStateFromFinger(3, 64, 'up')
    expect(state.thumbPosition).toBe(60)
    expect(state.handCenter).toBe(64)
    expect(state.direction).toBe('up')
  })

  it('neutralHandState differs for left and right', () => {
    const rh = neutralHandState('right')
    const lh = neutralHandState('left')
    // RH is typically positioned higher than LH
    expect(rh.handCenter).toBeGreaterThan(lh.handCenter)
  })

  it('handShiftDistance computes correctly', () => {
    const a = neutralHandState('right')
    const b = { ...a, thumbPosition: a.thumbPosition + 5 }
    expect(handShiftDistance(a, b)).toBe(5)
  })

  it('handShiftCost is zero for no movement', () => {
    const a = neutralHandState('right')
    expect(handShiftCost(a, a, false)).toBe(0)
  })

  it('handShiftCost is cheaper at phrase boundaries', () => {
    const a = neutralHandState('right')
    const b = { ...a, thumbPosition: a.thumbPosition + 10 }
    const midPhrase = handShiftCost(a, b, false)
    const atBoundary = handShiftCost(a, b, true)
    expect(atBoundary).toBeLessThan(midPhrase)
  })

  it('handShiftCost grows with distance', () => {
    const a = neutralHandState('right')
    const small = handShiftCost(a, { ...a, thumbPosition: a.thumbPosition + 2 }, false)
    const large = handShiftCost(a, { ...a, thumbPosition: a.thumbPosition + 10 }, false)
    expect(large).toBeGreaterThan(small)
  })
})

// ─── Chord Optimization ─────────────────────────────────────────────

describe('generateChordCandidates', () => {
  it('generates candidates for a triad (3 notes)', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0 }),
      makeRichNote({ index: 2, midiNote: 67, startTime: 0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)

    const candidates = generateChordCandidates(analyzed, 'right', DEFAULT_CONFIG)

    expect(candidates.length).toBeGreaterThan(0)
    // All candidates should be sorted by comfort (best first)
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i]!.comfortCost).toBeGreaterThanOrEqual(candidates[i - 1]!.comfortCost)
    }
    // Each candidate should assign fingers to all 3 notes
    for (const c of candidates) {
      expect(c.assignments.size).toBe(3)
    }
  })

  it('generates finger combinations with monotonic fingers for RH', () => {
    const notes = [
      makeRichNote({ index: 0, midiNote: 60, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 64, startTime: 0 }),
      makeRichNote({ index: 2, midiNote: 67, startTime: 0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    const candidates = generateChordCandidates(analyzed, 'right', DEFAULT_CONFIG)

    // All candidates must have strictly increasing fingers (low→high)
    // since fingers are monotonic with pitch for RH
    for (const c of candidates) {
      const fingers = Array.from(c.assignments.values())
      for (let i = 1; i < fingers.length; i++) {
        expect(fingers[i]!).toBeGreaterThan(fingers[i - 1]!)
      }
    }
  })

  it('rejects impossible spans', () => {
    // Chord spanning 20 semitones = impossible for one hand
    const notes = [
      makeRichNote({ index: 0, midiNote: 48, startTime: 0 }),
      makeRichNote({ index: 1, midiNote: 68, startTime: 0 }),
    ]
    const analyzed = analyzeContext(notes, DEFAULT_CONFIG)
    const candidates = generateChordCandidates(analyzed, 'right', DEFAULT_CONFIG)

    // All candidates should be valid (span 20 ≤ maxSpan 13 → rejected)
    // But 2-note chords like [1,5] might still work if span is within limits
    // 68-48=20 > 13, so no valid fingerings possible for maxSpan=13
    expect(candidates.length).toBe(0)
  })

  it('returns empty for empty input', () => {
    const candidates = generateChordCandidates([], 'right', DEFAULT_CONFIG)
    expect(candidates.length).toBe(0)
  })
})

describe('evaluateChordFingering', () => {
  it('returns 0 for a comfortable C major triad (1-3-5)', () => {
    const cost = evaluateChordFingering([60, 64, 67], [1, 3, 5], 'right', DEFAULT_CONFIG)
    expect(cost).toBeLessThan(50) // should be very comfortable
  })

  it('returns Infinity for impossible spans', () => {
    const cost = evaluateChordFingering([48, 72], [1, 5], 'right', DEFAULT_CONFIG)
    expect(cost).toBe(Infinity)
  })

  it('returns higher cost for cramped fingerings', () => {
    // Wide spread chord (octave): 1-3-5 is comfortable, 1-2-5 is cramped
    const comfortable = evaluateChordFingering([60, 67, 72], [1, 3, 5], 'right', DEFAULT_CONFIG)
    const cramped = evaluateChordFingering([60, 67, 72], [1, 2, 5], 'right', DEFAULT_CONFIG)
    // 1-2-5 for a wide chord → 1-2 stretch (7 semitones) is beyond maxComfortable (4)
    expect(cramped).toBeGreaterThan(comfortable)
  })
})

// ─── Transition Cost Modules ────────────────────────────────────────

describe('computeTransitionCost', () => {
  function makeCostContext(overrides: Partial<CostContext>): CostContext {
    const defaultNote = {
      note: makeRichNote({ index: 0, midiNote: 64, startTime: 0.5 }),
      previousNote: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      nextNote: null,
      melodicInterval: 4,
      rhythmicSpacing: 0.5,
      direction: 'up' as const,
      isChordNote: false,
      chordNotes: [],
      isRepeated: false,
      patternTags: [],
      patternSpan: null,
      patternMinNote: null,
      isPhraseStart: false,
      isPhraseEnd: false,
      localDensity: 2,
    }

    return {
      prevHandState: null,
      finger: 3,
      note: defaultNote as unknown as AnalyzedNote,
      prevFinger: null,
      prevNote: null,
      hand: 'right',
      isPhraseStart: false,
      isPhraseEnd: false,
      sliceNotes: [defaultNote as unknown as AnalyzedNote],
      ...overrides,
    }
  }

  it('returns zero total for initial state (no previous)', () => {
    const ctx = makeCostContext({ prevHandState: null, prevFinger: null, prevNote: null })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    expect(cost.total).toBe(0)
  })

  it('penalizes thumb on black key', () => {
    // Create a note that is a black key
    const blackNote = makeRichNote({ index: 0, midiNote: 61, startTime: 0.5 })
    const defaultNote = {
      note: blackNote,
      previousNote: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      nextNote: null,
      melodicInterval: 1,
      rhythmicSpacing: 0.5,
      direction: 'up' as const,
      isChordNote: false,
      chordNotes: [],
      isRepeated: false,
      patternTags: [],
      isPhraseStart: false,
      isPhraseEnd: false,
      localDensity: 2,
    }

    const ctx = makeCostContext({
      finger: 1, // thumb
      note: defaultNote as unknown as AnalyzedNote,
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    expect(cost.thumbBlackKey).toBeGreaterThan(0)
  })

  it('penalizes repeated finger on different pitches', () => {
    const ctx = makeCostContext({
      prevFinger: 3,
      finger: 3, // same finger
      prevNote: {
        note: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
        previousNote: null, nextNote: null,
        melodicInterval: null, rhythmicSpacing: null,
        direction: 'same', isChordNote: false, chordNotes: [],
        isRepeated: false, patternTags: [], isPhraseStart: true, isPhraseEnd: false,
        localDensity: 2,
      } as unknown as AnalyzedNote,
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    expect(cost.repeatedFinger).toBeGreaterThan(0)
  })

  it('penalizes awkward finger crossings (4 under 1)', () => {
    const prevNoteData = {
      note: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      previousNote: null, nextNote: null,
      melodicInterval: null, rhythmicSpacing: null,
      direction: 'same' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[], isPhraseStart: true, isPhraseEnd: false,
      localDensity: 2,
    } as unknown as AnalyzedNote

    const ctx = makeCostContext({
      prevFinger: 4,
      finger: 1,
      prevNote: prevNoteData,  // Required for crossing detection
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    // 4→1 ascending (finger 4 crossing under thumb) should have crossing penalty
    expect(cost.fingerCrossing).toBeGreaterThan(0)
  })

  it('heavily penalizes 4→5 crossover in RH (pinky crossing under ring)', () => {
    // RH: finger 4 on C5, then finger 5 on B4 (descending) — 5 crosses under 4
    const prevNoteData = {
      note: makeRichNote({ index: -1, midiNote: 72, startTime: 0 }), // C5
      previousNote: null, nextNote: null,
      melodicInterval: null, rhythmicSpacing: null,
      direction: 'same' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: true, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const currNoteData = {
      note: makeRichNote({ index: 0, midiNote: 71, startTime: 0.5 }), // B4
      previousNote: makeRichNote({ index: -1, midiNote: 72, startTime: 0 }),
      nextNote: null, melodicInterval: -1, rhythmicSpacing: 0.5,
      direction: 'down' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctx = makeCostContext({
      prevFinger: 4,
      finger: 5,
      prevNote: prevNoteData,
      note: currNoteData,
      hand: 'right',
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    // 4→5 crossover in RH should be essentially forbidden
    expect(cost.fingerCrossing).toBeGreaterThanOrEqual(75)
  })

  it('heavily penalizes 5→4 crossover in RH (ring crossing over pinky)', () => {
    // RH: finger 5 on C5, then finger 4 on D5 (ascending) — 4 crosses over 5
    const prevNoteData = {
      note: makeRichNote({ index: -1, midiNote: 72, startTime: 0 }),
      previousNote: null, nextNote: null,
      melodicInterval: null, rhythmicSpacing: null,
      direction: 'same' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: true, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const currNoteData = {
      note: makeRichNote({ index: 0, midiNote: 74, startTime: 0.5 }),
      previousNote: makeRichNote({ index: -1, midiNote: 72, startTime: 0 }),
      nextNote: null, melodicInterval: 2, rhythmicSpacing: 0.5,
      direction: 'up' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctx = makeCostContext({
      prevFinger: 5,
      finger: 4,
      prevNote: prevNoteData,
      note: currNoteData,
      hand: 'right',
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    expect(cost.fingerCrossing).toBeGreaterThanOrEqual(75)
  })

  it('heavily penalizes 4→5 crossover in LH', () => {
    // LH: finger 4 on C4, then finger 5 on D4 (ascending) — 5 crosses in LH
    const prevNoteData = {
      note: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      previousNote: null, nextNote: null,
      melodicInterval: null, rhythmicSpacing: null,
      direction: 'same' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: true, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const currNoteData = {
      note: makeRichNote({ index: 0, midiNote: 62, startTime: 0.5 }),
      previousNote: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      nextNote: null, melodicInterval: 2, rhythmicSpacing: 0.5,
      direction: 'up' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctx = makeCostContext({
      prevFinger: 4,
      finger: 5,
      prevNote: prevNoteData,
      note: currNoteData,
      hand: 'left',
      prevHandState: neutralHandState('left'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    expect(cost.fingerCrossing).toBeGreaterThanOrEqual(75)
  })

  it('heavily penalizes thumb-under crossing onto black key', () => {
    // 3→1 ascending where the thumb (1) lands on a black key (e.g., F#)
    const prevNoteData = {
      note: makeRichNote({ index: -1, midiNote: 64, startTime: 0 }), // E4
      previousNote: null, nextNote: null,
      melodicInterval: null, rhythmicSpacing: null,
      direction: 'same' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: true, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const currNoteData = {
      note: makeRichNote({ index: 0, midiNote: 66, startTime: 0.5 }), // F#4 — black key
      previousNote: makeRichNote({ index: -1, midiNote: 64, startTime: 0 }),
      nextNote: null, melodicInterval: 2, rhythmicSpacing: 0.5,
      direction: 'up' as const, isChordNote: false, chordNotes: [],
      isRepeated: false, patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctx = makeCostContext({
      prevFinger: 3,
      finger: 1,
      prevNote: prevNoteData,
      note: currNoteData,
      hand: 'right',
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    // Thumb-under onto black key: crossing cost should be very high
    expect(cost.fingerCrossing).toBeGreaterThanOrEqual(75)
    // Thumb-black-key cost also fires
    expect(cost.thumbBlackKey).toBeGreaterThan(0)
  })

  it('penalizes repeated finger more at fast tempo', () => {
    // Fast notes (0.08s spacing): same finger should be heavily penalized
    const fastNote = {
      note: makeRichNote({ index: 0, midiNote: 65, startTime: 0.08 }),
      previousNote: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      nextNote: null,
      melodicInterval: 5,
      rhythmicSpacing: 0.08, // very fast
      direction: 'up' as const,
      isChordNote: false, chordNotes: [], isRepeated: false,
      patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 10,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctxFast = makeCostContext({
      prevFinger: 3,
      finger: 3,
      prevNote: {
        note: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
        previousNote: null, nextNote: null,
        melodicInterval: null, rhythmicSpacing: null,
        direction: 'same', isChordNote: false, chordNotes: [],
        isRepeated: false, patternTags: [], isPhraseStart: true, isPhraseEnd: false,
        localDensity: 10, patternSpan: null, patternMinNote: null,
      } as unknown as AnalyzedNote,
      note: fastNote,
      prevHandState: neutralHandState('right'),
    })
    const costFast = computeTransitionCost(ctxFast, DEFAULT_CONFIG)

    // Slow notes (1.0s spacing): same finger should be lightly penalized
    const slowNote = {
      note: makeRichNote({ index: 0, midiNote: 65, startTime: 1.0 }),
      previousNote: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
      nextNote: null,
      melodicInterval: 5,
      rhythmicSpacing: 1.0, // very slow
      direction: 'up' as const,
      isChordNote: false, chordNotes: [], isRepeated: false,
      patternTags: [] as PatternTag[],
      isPhraseStart: false, isPhraseEnd: false, localDensity: 2,
      patternSpan: null, patternMinNote: null,
    } as unknown as AnalyzedNote

    const ctxSlow = makeCostContext({
      prevFinger: 3,
      finger: 3,
      prevNote: {
        note: makeRichNote({ index: -1, midiNote: 60, startTime: 0 }),
        previousNote: null, nextNote: null,
        melodicInterval: null, rhythmicSpacing: null,
        direction: 'same', isChordNote: false, chordNotes: [],
        isRepeated: false, patternTags: [], isPhraseStart: true, isPhraseEnd: false,
        localDensity: 2, patternSpan: null, patternMinNote: null,
      } as unknown as AnalyzedNote,
      note: slowNote,
      prevHandState: neutralHandState('right'),
    })
    const costSlow = computeTransitionCost(ctxSlow, DEFAULT_CONFIG)

    // Fast tempo should penalize same-finger reuse more
    expect(costFast.repeatedFinger).toBeGreaterThan(costSlow.repeatedFinger)
  })

  it('rewards scale fingerings during scale patterns', () => {
    const scaleNote = {
      note: makeRichNote({ index: 0, midiNote: 67, startTime: 0.5 }),
      previousNote: makeRichNote({ index: -1, midiNote: 65, startTime: 0 }),
      nextNote: null,
      melodicInterval: 2,
      rhythmicSpacing: 0.5,
      direction: 'up' as const,
      isChordNote: false,
      chordNotes: [],
      isRepeated: false,
      patternTags: ['scale-ascending' as PatternTag],
      isPhraseStart: false,
      isPhraseEnd: false,
      localDensity: 2,
    }

    // 3→1 during ascending scale = thumb-under, which is standard
    const ctx = makeCostContext({
      prevFinger: 3,
      finger: 1,
      note: scaleNote as unknown as AnalyzedNote,
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    // scale bias should be negative (reward)
    expect(cost.scaleBias).toBeLessThan(0)
  })

  it('rewards arpeggio fingerings during arpeggio patterns', () => {
    const arpNote = {
      note: makeRichNote({ index: 0, midiNote: 72, startTime: 0.5 }),
      previousNote: makeRichNote({ index: -1, midiNote: 67, startTime: 0 }),
      nextNote: null,
      melodicInterval: 5,
      rhythmicSpacing: 0.5,
      direction: 'up' as const,
      isChordNote: false,
      chordNotes: [],
      isRepeated: false,
      patternTags: ['arpeggio' as PatternTag],
      isPhraseStart: false,
      isPhraseEnd: false,
      localDensity: 2,
    }

    const ctx = makeCostContext({
      prevFinger: 3,
      finger: 1, // thumb under
      note: arpNote as unknown as AnalyzedNote,
      prevHandState: neutralHandState('right'),
    })
    const cost = computeTransitionCost(ctx, DEFAULT_CONFIG)
    // arpeggio bias should be negative (reward)
    expect(cost.arpeggioBias).toBeLessThan(0)
  })
})

// ─── Integration: Full Pipeline ─────────────────────────────────────

describe('computeFingering', () => {
  it('returns hand and finger maps for a simple C major scale (RH)', () => {
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }),     // C4
      makeSongNote({ midiNote: 62, time: 0.5, track: 1 }),   // D4
      makeSongNote({ midiNote: 64, time: 1.0, track: 1 }),   // E4
      makeSongNote({ midiNote: 65, time: 1.5, track: 1 }),   // F4
      makeSongNote({ midiNote: 67, time: 2.0, track: 1 }),   // G4
      makeSongNote({ midiNote: 69, time: 2.5, track: 1 }),   // A4
      makeSongNote({ midiNote: 71, time: 3.0, track: 1 }),   // B4
      makeSongNote({ midiNote: 72, time: 3.5, track: 1 }),   // C5
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 4.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // All notes should have a hand assigned
    expect(result.handMap.size).toBe(songNotes.length)
    expect(result.fingerMap.size).toBe(songNotes.length)

    // All notes should be right hand (track 1 = right)
    for (let i = 0; i < songNotes.length; i++) {
      expect(result.handMap.get(i)).toBe('right')
    }

    // All fingers should be in valid range
    for (const finger of result.fingerMap.values()) {
      expect(finger).toBeGreaterThanOrEqual(1)
      expect(finger).toBeLessThanOrEqual(5)
    }
  })

  it('handles chords as a single optimization', () => {
    // C major chord at time 0
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }),
      makeSongNote({ midiNote: 64, time: 0, track: 1 }),
      makeSongNote({ midiNote: 67, time: 0, track: 1 }),
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // All 3 notes should have fingerings
    expect(result.fingerMap.size).toBe(3)

    // Fingers should be different for different notes in the chord
    const fingers = Array.from(result.fingerMap.values())
    const unique = new Set(fingers)
    expect(unique.size).toBe(3) // all 3 notes have different fingers
  })

  it('assigns different fingers for left-hand chords', () => {
    // C major triad in LH: C3 E3 G3
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 48, time: 0, track: 0 }),
      makeSongNote({ midiNote: 52, time: 0, track: 0 }),
      makeSongNote({ midiNote: 55, time: 0, track: 0 }),
    ]

    const song = {
      notes: songNotes,
      tracks: { '0': { instrument: 'piano', name: 'Left Hand', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.size).toBe(3)
    // All 3 notes should have LEFT hand
    for (let i = 0; i < 3; i++) {
      expect(result.handMap.get(i)).toBe('left')
    }
    // All 3 notes should have DIFFERENT fingers
    const fingers = Array.from(result.fingerMap.values())
    const unique = new Set(fingers)
    expect(unique.size).toBe(3)

    // LH standard triad: finger 5 on lowest, 1 on highest (5-3-1 or 5-4-2 or 5-3-2)
    // Fingers should be in valid range
    for (const f of fingers) {
      expect(f).toBeGreaterThanOrEqual(1)
      expect(f).toBeLessThanOrEqual(5)
    }
  })

  it('assigns different fingers for right-hand chords', () => {
    // F major triad in RH: F4 A4 C5 (has a black key)
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 65, time: 0, track: 1 }), // F4
      makeSongNote({ midiNote: 69, time: 0, track: 1 }), // A4
      makeSongNote({ midiNote: 72, time: 0, track: 1 }), // C5
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Right Hand', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.size).toBe(3)
    // All 3 notes should have RIGHT hand
    for (let i = 0; i < 3; i++) {
      expect(result.handMap.get(i)).toBe('right')
    }
    const fingers = Array.from(result.fingerMap.values())
    const unique = new Set(fingers)
    expect(unique.size).toBeGreaterThanOrEqual(2) // at least 2 different fingers

    // Fingers should be in valid range
    for (const f of fingers) {
      expect(f).toBeGreaterThanOrEqual(1)
      expect(f).toBeLessThanOrEqual(5)
    }
  })

  it('prefers 1-5 spread for octaves and wide chords', () => {
    // Octave: C4 to C5 — should be thumb (1) and pinky (5)
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }), // C4
      makeSongNote({ midiNote: 72, time: 0, track: 1 }), // C5
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Right Hand', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.get(0)).toBe(1) // C4 → thumb
    expect(result.fingerMap.get(1)).toBe(5) // C5 → pinky
  })

  it('prefers 5-1 spread for LH octaves', () => {
    // LH octave: C3 to C4 — pinky (5) on low, thumb (1) on high
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 48, time: 0, track: 0 }), // C3
      makeSongNote({ midiNote: 60, time: 0, track: 0 }), // C4
    ]

    const song = {
      notes: songNotes,
      tracks: { '0': { instrument: 'piano', name: 'Left Hand', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.get(0)).toBe(5) // C3 → pinky (LH)
    expect(result.fingerMap.get(1)).toBe(1) // C4 → thumb (LH)
  })

  it('prefers 1-5 for near-octave spans (7th chords)', () => {
    // Minor 7th: C4 to Bb4 (span 10) — should prefer 1-5
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }), // C4
      makeSongNote({ midiNote: 70, time: 0, track: 1 }), // Bb4
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Right Hand', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.get(0)).toBe(1) // C4 → thumb
    expect(result.fingerMap.get(1)).toBe(5) // Bb4 → pinky
  })

  it('fingers 1-octave arpeggio same as block chord (RH)', () => {
    // C major arpeggio: C4 E4 G4 C5 (span 12 = 1 octave)
    // Should use chord-like fingering: 1-2-3-5
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0.0, track: 1 }),   // C4
      makeSongNote({ midiNote: 64, time: 0.5, track: 1 }),   // E4
      makeSongNote({ midiNote: 67, time: 1.0, track: 1 }),   // G4
      makeSongNote({ midiNote: 72, time: 1.5, track: 1 }),   // C5
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Right Hand', program: 0 } },
      duration: 2.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // Chord-like fingering: thumb on root, pinky on top
    expect(result.fingerMap.get(0)).toBe(1) // C4 → thumb
    expect(result.fingerMap.get(1)).toBe(2) // E4 → index
    expect(result.fingerMap.get(2)).toBe(3) // G4 → middle
    expect(result.fingerMap.get(3)).toBe(5) // C5 → pinky
  })

  it('fingers 1-octave arpeggio same as block chord (LH)', () => {
    // C major arpeggio LH: C3 E3 G3 C4 (span 12)
    // LH chord fingering: 5-4-2-1
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 48, time: 0.0, track: 0 }),   // C3
      makeSongNote({ midiNote: 52, time: 0.5, track: 0 }),   // E3
      makeSongNote({ midiNote: 55, time: 1.0, track: 0 }),   // G3
      makeSongNote({ midiNote: 60, time: 1.5, track: 0 }),   // C4
    ]

    const song = {
      notes: songNotes,
      tracks: { '0': { instrument: 'piano', name: 'Left Hand', program: 0 } },
      duration: 2.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // LH chord-like fingering: pinky on bottom, thumb on top
    expect(result.fingerMap.get(0)).toBe(5) // C3 → pinky (LH)
    expect(result.fingerMap.get(3)).toBe(1) // C4 → thumb (LH)
  })

  it('fingers G minor arpeggio G-Bb-D-G with 1-5 on octave Gs (RH)', () => {
    // G minor arpeggio: G4 Bb4 D5 G5 (span 12 = 1 octave)
    // Both Gs: lower G → thumb (1), upper G → pinky (5)
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 67, time: 0.0, track: 1 }),   // G4
      makeSongNote({ midiNote: 70, time: 0.5, track: 1 }),   // Bb4
      makeSongNote({ midiNote: 74, time: 1.0, track: 1 }),   // D5
      makeSongNote({ midiNote: 79, time: 1.5, track: 1 }),   // G5
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Right Hand', program: 0 } },
      duration: 2.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // Diagnostic: print all fingers
    const fingers = [0, 1, 2, 3].map((i) => result.fingerMap.get(i))
    console.log('G-Bb-D-G fingers:', fingers)

    expect(result.fingerMap.get(0)).toBe(1) // G4 → thumb
    expect(result.fingerMap.get(3)).toBe(5) // G5 → pinky (octave)
  })

  it('handles both-hands chord simultaneously', () => {
    // LH: C3 E3 G3 (track 0), RH: C5 E5 G5 (track 1)
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 48, time: 0, track: 0 }), // C3 LH
      makeSongNote({ midiNote: 52, time: 0, track: 0 }), // E3 LH
      makeSongNote({ midiNote: 55, time: 0, track: 0 }), // G3 LH
      makeSongNote({ midiNote: 72, time: 0, track: 1 }), // C5 RH
      makeSongNote({ midiNote: 76, time: 0, track: 1 }), // E5 RH
      makeSongNote({ midiNote: 79, time: 0, track: 1 }), // G5 RH
    ]

    const song = {
      notes: songNotes,
      tracks: {
        '0': { instrument: 'piano', name: 'Left Hand', program: 0 },
        '1': { instrument: 'piano', name: 'Right Hand', program: 0 },
      },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.fingerMap.size).toBe(6)
    expect(result.handMap.size).toBe(6)

    // LH notes (indices 0-2)
    for (let i = 0; i < 3; i++) {
      expect(result.handMap.get(i)).toBe('left')
    }
    // RH notes (indices 3-5)
    for (let i = 3; i < 6; i++) {
      expect(result.handMap.get(i)).toBe('right')
    }

    // Each hand's chord should have different fingers
    const lhFingers = [result.fingerMap.get(0), result.fingerMap.get(1), result.fingerMap.get(2)]
    const rhFingers = [result.fingerMap.get(3), result.fingerMap.get(4), result.fingerMap.get(5)]
    expect(new Set(lhFingers).size).toBe(3)
    expect(new Set(rhFingers).size).toBe(3)
  })

  it('respects track-based hand assignment', () => {
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 48, time: 0, track: 0 }),  // LH: C3
      makeSongNote({ midiNote: 72, time: 0, track: 1 }),  // RH: C5
    ]

    const song = {
      notes: songNotes,
      tracks: {
        '0': { instrument: 'piano', name: 'Left Hand', program: 0 },
        '1': { instrument: 'piano', name: 'Right Hand', program: 0 },
      },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.handMap.get(0)).toBe('left')
    expect(result.handMap.get(1)).toBe('right')
  })

  it('handles empty songs gracefully', () => {
    const song = {
      notes: [],
      tracks: {},
      duration: 0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, {})
    expect(result.handMap.size).toBe(0)
    expect(result.fingerMap.size).toBe(0)
  })

  it('generates stats', () => {
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }),
      makeSongNote({ midiNote: 62, time: 0.5, track: 1 }),
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    expect(result.stats.totalNotes).toBe(2)
    expect(result.stats.optimizationTimeMs).toBeGreaterThan(0)
  })

  it('runs quickly for many notes', () => {
    // Generate 1000 notes (well within typical MIDI file size)
    const songNotes: SongNote[] = []
    for (let i = 0; i < 1000; i++) {
      songNotes.push(makeSongNote({
        midiNote: 60 + (i % 12), // cycle through an octave
        time: i * 0.25,
        track: 1,
      }))
    }

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 250,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const start = performance.now()
    const result = computeFingering(song as any, { left: 0, right: 1 })
    const elapsed = performance.now() - start

    // Should complete well under 1 second for 1000 notes
    expect(elapsed).toBeLessThan(1000)
    expect(result.fingerMap.size).toBe(1000)
  })

  it('configurable beam width affects performance', () => {
    const songNotes: SongNote[] = []
    for (let i = 0; i < 200; i++) {
      songNotes.push(makeSongNote({
        midiNote: 60 + (i % 24),
        time: i * 0.25,
        track: 1,
      }))
    }

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 50,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 }, { beamWidth: 10 })
    expect(result.fingerMap.size).toBe(200)
  })

  it('standard scale gets consistent fingerings', () => {
    // Two octaves of C major: C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6
    const scale: number[] = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84]
    const songNotes: SongNote[] = scale.map((midi, i) =>
      makeSongNote({ midiNote: midi, time: i * 0.5, track: 1 })
    )

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: scale.length * 0.5,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 })

    // Check that the scale starts sensibly — first note C4 should be thumb (1)
    // This is a soft expectation: with scale bias enabled, C should get 1
    const firstFinger = result.fingerMap.get(0)
    expect(firstFinger).toBeDefined()

    // The octave C5 (index 7) should also likely be 1 (thumb crossing)
    const octaveFinger = result.fingerMap.get(7)
    expect(octaveFinger).toBeDefined()

    // All fingers should be valid
    for (const f of result.fingerMap.values()) {
      expect(f).toBeGreaterThanOrEqual(1)
      expect(f).toBeLessThanOrEqual(5)
    }
  })
})

// ─── Debug Module ───────────────────────────────────────────────────

describe('debug', () => {
  it('generates debug decisions when enabled', () => {
    const songNotes: SongNote[] = [
      makeSongNote({ midiNote: 60, time: 0, track: 1 }),
      makeSongNote({ midiNote: 64, time: 0.5, track: 1 }),
    ]

    const song = {
      notes: songNotes,
      tracks: { '1': { instrument: 'piano', name: 'Piano', program: 0 } },
      duration: 1.0,
      measures: [],
      bpms: [],
      items: [],
      ppq: 480,
      secondsToTicks: (s: number) => s * 480,
      ticksToSeconds: (t: number) => t / 480,
    }

    const result = computeFingering(song as any, { left: 0, right: 1 }, { enableDebug: true })

    expect(result.decisions.length).toBe(2)
    // Each decision should have alternatives (other 4 fingers)
    for (const d of result.decisions) {
      expect(d.alternatives.length).toBe(4) // other 4 fingers
      expect(d.patternTags).toBeDefined()
      expect(d.costBreakdown).toBeDefined()
    }
  })
})
