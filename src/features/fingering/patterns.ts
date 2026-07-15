/**
 * Piano Fingering Engine — Pattern Recognition
 *
 * Lightweight musical analysis performed before fingering optimization.
 * Detects known patterns (scales, arpeggios, chromatic runs, etc.) and
 * annotates notes with tags. These tags are consumed by cost modules
 * (e.g., scale bias, arpeggio bias) to guide the optimizer toward
 * standard fingerings.
 *
 * CRITICAL: Pattern detection only ANNOTATES notes. It never assigns
 * fingerings directly. The optimizer remains free to override pattern
 * suggestions when surrounding context makes another fingering preferable.
 */

import type { AnalyzedNote, PatternTag } from './types'
import type { FingeringConfig } from './config'

/**
 * Run pattern recognition over a sequence of analyzed notes.
 * Mutates the patternTags array on each note in place.
 *
 * Detection runs in a single pass over the notes, O(n).
 * Each detector examines a sliding window and annotates qualifying runs.
 */
export function recognizePatterns(
  notes: readonly AnalyzedNote[],
  config: FingeringConfig,
): void {
  detectStepwiseRuns(notes, config)
  detectChromaticPassages(notes, config)
  detectBrokenChordsAndArpeggios(notes, config)
  detectRepeatedNotes(notes, config)
  detectTremolos(notes, config)
  detectLargeLeaps(notes, config)
}

// ─── Stepwise Runs & Scales ─────────────────────────────────────────

function detectStepwiseRuns(notes: readonly AnalyzedNote[], config: FingeringConfig): void {
  const n = notes.length
  let runStart = 0

  for (let i = 1; i <= n; i++) {
    const continues = i < n &&
      notes[i]!.melodicInterval !== null &&
      Math.abs(notes[i]!.melodicInterval!) <= config.stepwiseMaxInterval &&
      notes[i]!.direction !== 'same' &&
      (runStart === i - 1 || notes[i]!.direction === notes[i - 1]!.direction)

    if (!continues) {
      const runLength = i - runStart
      if (runLength >= 4) {
        const direction = notes[runStart + 1]?.direction ?? 'up'
        const scaleTag: PatternTag = direction === 'up' ? 'scale-ascending' : 'scale-descending'
        const stepTag: PatternTag = direction === 'up' ? 'stepwise-up' : 'stepwise-down'

        for (let j = runStart; j < i && j < n; j++) {
          const tags = notes[j]!.patternTags
          if (!tags.includes(scaleTag)) tags.push(scaleTag)
          if (j > runStart && !tags.includes(stepTag)) tags.push(stepTag)
        }
      } else if (runLength >= 2 && runLength < 4) {
        const direction = notes[runStart + 1]?.direction ?? 'up'
        const stepTag: PatternTag = direction === 'up' ? 'stepwise-up' : 'stepwise-down'
        for (let j = runStart + 1; j < i && j < n; j++) {
          const tags = notes[j]!.patternTags
          if (!tags.includes(stepTag)) tags.push(stepTag)
        }
      }
      runStart = i
    }
  }
}

// ─── Chromatic Passages ─────────────────────────────────────────────

function detectChromaticPassages(notes: readonly AnalyzedNote[], config: FingeringConfig): void {
  const n = notes.length
  let runStart = 0

  for (let i = 1; i <= n; i++) {
    const isChromatic = i < n &&
      notes[i]!.melodicInterval !== null &&
      Math.abs(notes[i]!.melodicInterval!) === 1 &&
      notes[i]!.direction !== 'same' &&
      (runStart === i - 1 || notes[i]!.direction === notes[i - 1]!.direction)

    if (!isChromatic) {
      const runLength = i - runStart
      if (runLength >= config.chromaticMinRun) {
        const direction = notes[runStart + 1]?.direction ?? 'up'
        const tag: PatternTag = direction === 'up' ? 'chromatic-up' : 'chromatic-down'

        for (let j = runStart + 1; j < i && j < n; j++) {
          const tags = notes[j]!.patternTags
          if (!tags.includes(tag)) tags.push(tag)
        }
      }
      runStart = i
    }
  }
}

// ─── Broken Chords & Arpeggios ──────────────────────────────────────

function detectBrokenChordsAndArpeggios(notes: readonly AnalyzedNote[], config: FingeringConfig): void {
  const n = notes.length
  let runStart = 0

  for (let i = 1; i <= n; i++) {
    const isChordal = i < n &&
      notes[i]!.melodicInterval !== null &&
      Math.abs(notes[i]!.melodicInterval!) >= 3 &&
      Math.abs(notes[i]!.melodicInterval!) <= config.brokenChordMaxInterval &&
      notes[i]!.direction !== 'same' &&
      (runStart === i - 1 || notes[i]!.direction === notes[i - 1]!.direction)

    if (!isChordal) {
      const runLength = i - runStart
      if (runLength >= 3) {
        const firstNote = notes[runStart]!.note
        const lastNote = notes[i - 1]!.note
        const totalSpan = Math.abs(lastNote.midiNote - firstNote.midiNote)

        const tag: PatternTag = totalSpan >= config.arpeggioMinSpan ? 'arpeggio' : 'broken-chord'
        const minNote = Math.min(firstNote.midiNote, lastNote.midiNote)

        for (let j = runStart; j < i && j < n; j++) {
          const noteObj = notes[j]!
          const tags = noteObj.patternTags
          if (!tags.includes(tag)) tags.push(tag)
          // Store pattern span and baseline for chord-like finger mapping
          noteObj.patternSpan = totalSpan
          noteObj.patternMinNote = minNote
        }
      }
      runStart = i
    }
  }
}

// ─── Repeated Notes ─────────────────────────────────────────────────

function detectRepeatedNotes(notes: readonly AnalyzedNote[], _config: FingeringConfig): void {
  for (let i = 1; i < notes.length; i++) {
    if (notes[i]!.isRepeated) {
      const tags = notes[i]!.patternTags
      if (!tags.includes('repeated-note')) tags.push('repeated-note')

      const prevTags = notes[i - 1]!.patternTags
      if (!prevTags.includes('repeated-note')) prevTags.push('repeated-note')
    }
  }
}

// ─── Tremolos ───────────────────────────────────────────────────────

function detectTremolos(notes: readonly AnalyzedNote[], _config: FingeringConfig): void {
  if (notes.length < 3) return

  for (let i = 2; i < notes.length; i++) {
    const a = notes[i - 2]!.note
    const b = notes[i - 1]!.note
    const c = notes[i]!.note

    if (
      a.midiNote === c.midiNote &&
      a.midiNote !== b.midiNote &&
      a.startTime - (notes[i - 2]!.previousNote?.endTime ?? 0) < 0.3
    ) {
      for (let j = i - 2; j <= i; j++) {
        const tags = notes[j]!.patternTags
        if (!tags.includes('tremolo')) tags.push('tremolo')
      }
    }
  }
}

// ─── Large Leaps ────────────────────────────────────────────────────

function detectLargeLeaps(notes: readonly AnalyzedNote[], config: FingeringConfig): void {
  for (let i = 1; i < notes.length; i++) {
    const interval = notes[i]!.melodicInterval
    if (interval !== null && Math.abs(interval) >= config.largeLeapMinInterval) {
      const tags = notes[i]!.patternTags
      if (!tags.includes('large-leap')) tags.push('large-leap')
    }
  }
}
