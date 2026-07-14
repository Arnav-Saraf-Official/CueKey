/**
 * Piano Fingering Engine — Debug & Explainability
 *
 * For every assigned finger, provides:
 *   - chosen finger with cost breakdown
 *   - alternative candidates that were considered and rejected
 *   - estimated hand position at time of assignment
 *   - reason competing candidates were rejected
 *
 * This information is for development and tuning, not for end users.
 */

import type {
  Finger,
  Hand,
  AnalyzedNote,
  FingerDecision,
  FingerCandidate,
  CostBreakdown,
} from './types'
import type { FingeringConfig } from './config'
import type { CostContext } from './costs'
import { computeTransitionCost } from './costs'
import { ALL_FINGERS } from './types'
import { handStateFromFinger } from './hand-model'
import { FINGER_PROPERTIES } from './ergonomics'

/**
 * Generate a debug decision record for a single note.
 * Evaluates all 5 finger candidates and records why each was
 * accepted or rejected.
 *
 * @param note - The note being fingered
 * @param chosenFinger - The finger the optimizer selected
 * @param handState - Hand state before this note
 * @param prevFinger - Previously used finger (null if first note)
 * @param prevNote - Previous note (null if first)
 * @param config - Engine configuration
 */
export function debugFingerDecision(
  note: AnalyzedNote,
  chosenFinger: Finger,
  hand: Hand,
  handPosition: number,
  prevFinger: Finger | null,
  prevNote: AnalyzedNote | null,
  prevHandState: import('./types').HandState | null,
  config: FingeringConfig,
): FingerDecision {
  const alternatives: FingerCandidate[] = []

  for (const finger of ALL_FINGERS) {
    if (finger === chosenFinger) continue

    const ctx: CostContext = {
      prevHandState,
      finger,
      note,
      prevFinger,
      prevNote,
      hand,
      isPhraseStart: note.isPhraseStart,
      isPhraseEnd: note.isPhraseEnd,
      sliceNotes: note.chordNotes.length > 0 ? [note] : [note],
    }

    const costBreakdown = computeTransitionCost(ctx, config)

    let reason = ''
    if (costBreakdown.thumbBlackKey > 40) {
      reason = `thumb on black key (+${costBreakdown.thumbBlackKey.toFixed(0)})`
    } else if (costBreakdown.fingerCrossing > 30) {
      reason = `awkward finger crossing (+${costBreakdown.fingerCrossing.toFixed(0)})`
    } else if (costBreakdown.stretch > 50) {
      reason = `excessive stretch (+${costBreakdown.stretch.toFixed(0)})`
    } else if (costBreakdown.repeatedFinger > 20) {
      reason = `repeated finger on different pitch (+${costBreakdown.repeatedFinger.toFixed(0)})`
    } else if (costBreakdown.handShift > 30) {
      reason = `large hand shift (+${costBreakdown.handShift.toFixed(0)})`
    } else {
      reason = `higher total cost: ${costBreakdown.total.toFixed(0)} vs chosen`
    }

    alternatives.push({
      finger,
      cost: costBreakdown.total,
      costBreakdown,
      reason,
    })
  }

  // Sort alternatives by cost
  alternatives.sort((a, b) => a.cost - b.cost)

  // Compute cost breakdown for the chosen finger
  const chosenCtx: CostContext = {
    prevHandState,
    finger: chosenFinger,
    note,
    prevFinger,
    prevNote,
    hand,
    isPhraseStart: note.isPhraseStart,
    isPhraseEnd: note.isPhraseEnd,
    sliceNotes: note.chordNotes.length > 0 ? [note] : [note],
  }
  const chosenCostBreakdown = computeTransitionCost(chosenCtx, config)

  return {
    noteIndex: note.note.index,
    midiNote: note.note.midiNote,
    finger: chosenFinger,
    hand,
    handPosition,
    cost: chosenCostBreakdown.total,
    costBreakdown: chosenCostBreakdown,
    alternatives,
    patternTags: note.patternTags,
  }
}

/**
 * Generate a human-readable debug report for a set of decisions.
 */
export function formatDebugReport(decisions: readonly FingerDecision[]): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    '              PIANO FINGERING — DEBUG REPORT                ',
    '═══════════════════════════════════════════════════════════',
    '',
  ]

  for (const d of decisions) {
    const noteName = midiToNoteName(d.midiNote)
    const fingerName = FINGER_PROPERTIES[d.finger].name
    const handLetter = d.hand === 'right' ? 'R' : 'L'

    lines.push(
      `Note #${d.noteIndex}: ${noteName} (MIDI ${d.midiNote}) → ` +
      `${handLetter}${d.finger} (${fingerName}) | cost: ${d.cost.toFixed(1)} | ` +
      `hand pos: ${d.handPosition}`
    )

    // Cost breakdown
    const cb = d.costBreakdown
    lines.push(`  Costs: trans=${cb.fingerTransition.toFixed(1)} stretch=${cb.stretch.toFixed(1)} ` +
      `shift=${cb.handShift.toFixed(1)} cross=${cb.fingerCrossing.toFixed(1)} ` +
      `repeat=${cb.repeatedFinger.toFixed(1)} thumbBlk=${cb.thumbBlackKey.toFixed(1)} ` +
      `dir=${cb.directionConsistency.toFixed(1)} pattern=${cb.patternConsistency.toFixed(1)} ` +
      `scaleBias=${cb.scaleBias.toFixed(1)} arpBias=${cb.arpeggioBias.toFixed(1)} ` +
      `leap=${cb.leapRecovery.toFixed(1)} phrase=${cb.phraseBoundary.toFixed(1)} ` +
      `chord=${cb.chordComfort.toFixed(1)}`)

    // Patterns
    if (d.patternTags.length > 0) {
      lines.push(`  Patterns: ${d.patternTags.join(', ')}`)
    }

    // Top alternatives that were rejected
    if (d.alternatives.length > 0) {
      const topAlt = d.alternatives[0]!
      lines.push(`  Best alternative: finger ${topAlt.finger} (cost ${topAlt.cost.toFixed(1)}) — ${topAlt.reason}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Convert a MIDI note number to a human-readable name (e.g., "C4", "F#3").
 */
function midiToNoteName(midiNote: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const octave = Math.floor(midiNote / 12) - 1
  const name = names[midiNote % 12]!
  return `${name}${octave}`
}
