# PLAN.md — Fingering, Wait Mode Colors, Loopback Toggle

Date: 2026-07-09

---

## Overview

Four interconnected features targeting wait-mode UX and MIDI ergonomics:

1. **Wait mode fingering display** — orange keys with fingering labels (R1, L2, etc.) on piano roll
2. **Played/hit note coloring** — blue for LH notes, green for RH notes on piano keys
3. **Waterfall note colors** — blue/green by hand (replace current orange/purple HAND_COLORS)
4. **Loopback toggle** — prevent MIDI output echo back to piano keyboard

---

## Feature 1: Wait Mode Fingering Display

### What changes

In wait mode, notes waiting to be played show as **orange** on the piano keyboard with **fingering numbers** (R1, R2, R3... for right hand, L1, L2, L3... for left hand).

### Why

Currently, wait mode pauses the song but gives no visual cue about WHICH key to press or WHICH finger to use. User must guess from the falling notes. Displaying fingering directly on the piano roll makes wait mode a proper learning tool.

### Implementation plan

#### Step 1.1 — Compute waiting notes with finger assignments

**File:** `src/features/player/player.ts`

Add a method to `Player` that returns the current waiting notes with finger assignments:

```typescript
// New method on Player class
getWaitingNotes(): Array<{ note: SongNote; hand: 'left' | 'right'; finger: number }> {
  const waiting: Array<{ note: SongNote; hand: 'left' | 'right'; finger: number }> = []
  for (const [midiNote, note] of this.lateNotes.entries()) {
    const hand = this.getHandForNote(note)
    waiting.push({
      note,
      hand,
      finger: this.getFingerForNote(note, hand),
    })
  }
  return waiting
}

// Determine hand for a note based on track hand assignment
getHandForNote(note: SongNote): 'left' | 'right' {
  const trackHand = this.songHands
  if (note.track === trackHand.left) return 'left'
  if (note.track === trackHand.right) return 'right'
  // Fallback: pitch-based (C4 = MIDI 60 boundary)
  return note.midiNote < 60 ? 'left' : 'right'
}

// Assign finger number (1-5) for a note given its hand
// Simple v1: just number sequentially per hand (R1, R2, R3 / L1, L2, L3)
// Future v2: use scale/chord template matching from fingering.md Section 3-5
getFingerForNote(note: SongNote, hand: 'left' | 'right'): number {
  // v1: sequential numbering — group consecutive waiting notes, number by position
  // v2: integrate template matching algorithm
  return 1 // placeholder — actual logic below
}
```

**Fingering assignment v1 algorithm** (sequential per hand):

```
1. Get all waiting notes, group by hand
2. Within each hand, sort by pitch ascending (LH) or descending (RH)
3. Assign fingers 1-5 from lowest to highest pitch:
   - 1 note  → finger 1 (index)
   - 2 notes → fingers 1, 2 or 1, 5 (depends on stretch)
   - 3 notes → fingers 1, 2, 3 (or 1, 3, 5 for triad)
   - 4 notes → fingers 1, 2, 3, 4
   - 5 notes → fingers 1, 2, 3, 4, 5
4. Compact stretch check: if interval > 5 semitones between adjacent
   assigned fingers, skip a finger number
```

#### Step 1.2 — Expose waiting notes as Jotai atom

**File:** `src/features/player/player.ts`

Add a derived atom so canvas renderer can reactively read waiting notes:

```typescript
// New atom on Player
waitingNotes: Atom<Array<{ midiNote: number; hand: 'left' | 'right'; finger: number }>>

// Updated in playLoop_, recomputed when lateNotes changes
```

#### Step 1.3 — Render orange waiting keys on piano roll

**File:** `src/features/SongVisualization/falling-notes.ts`

Modify `getActiveNotes()` to include waiting notes in orange:

```typescript
function getActiveNotes(state: State, inViewNotes: SongNote[]): Map<number, string> {
  const activeNotes = new Map<number, string>()
  
  // MIDI-pressed notes → grey
  for (let midiNote of midiState.getPressedNotes().keys()) {
    activeNotes.set(midiNote, 'grey')
  }
  
  // Playing notes → hand color (blue/green)
  for (let note of inViewNotes) {
    if (isPlayingNote(state, note)) {
      const transposed = getTransposedMidi(state, note)
      activeNotes.set(transposed, getNoteColor(state, note))
    }
  }
  
  // NEW: Waiting notes → orange
  const waitingNotes = state.player.getWaitingNotes()
  for (let w of waitingNotes) {
    const transposed = transposeMidi(w.note.midiNote, state.transpose)
    activeNotes.set(transposed, '#f97316') // orange-500
  }
  
  return activeNotes
}
```

#### Step 1.4 — Render fingering labels on piano keys

**File:** `src/features/drawing/piano.ts`

Modify `drawPianoRoll()` to accept an optional map of `{ midiNote → label }` and draw labels:

```typescript
export async function drawPianoRoll(
  ctx: CanvasRenderingContext2D,
  measurements: PianoRollMeasurements,
  pianoTopY: number,
  activeNotes: Map<number, Color>,
  fingerLabels?: Map<number, string>,  // NEW parameter
) {
  // ... existing drawing code ...
  
  // After drawing each key, overlay fingering label if present
  for (let [midiNote, lane] of Object.entries(measurements.lanes)) {
    const label = fingerLabels?.get(+midiNote)
    if (label) {
      // Draw circled label on key
      drawFingerLabel(ctx, lane, pianoTopY, isBlack(+midiNote), label)
    }
  }
}

function drawFingerLabel(
  ctx: CanvasRenderingContext2D,
  lane: { left: number; width: number },
  pianoTopY: number,
  isBlack: boolean,
  label: string,
) {
  const centerX = lane.left + lane.width / 2
  const y = isBlack 
    ? pianoTopY + 15  // on black key body
    : pianoTopY + 40  // lower on white key
  const radius = Math.max(10, lane.width / 3)
  
  // White circle background
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(centerX, y, radius, 0, Math.PI * 2)
  ctx.fill()
  
  // Orange border
  ctx.strokeStyle = '#f97316'
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Label text
  ctx.fillStyle = '#f97316'
  ctx.font = `bold ${radius * 0.9}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, centerX, y)
}
```

#### Step 1.5 — Show fingering on falling note blocks in wait mode

**File:** `src/features/SongVisualization/falling-notes.ts`

Modify `renderFallingNote()` to show finger number when the note is waiting:

```typescript
export function renderFallingNote(note: SongNote, state: State): void {
  // ... existing rendering ...
  
  // NEW: If note is waiting, overlay finger number prominently
  const isWaiting = /* check if note is in player.lateNotes */ 
  if (isWaiting) {
    // Orange overlay on note block
    ctx.fillStyle = 'rgba(249, 115, 22, 0.3)'
    roundRect(ctx, posX, posY, width, length)
    
    // Finger number in center
    const fingerLabel = getFingerLabel(note, state)
    ctx.fillStyle = '#f97316'
    ctx.font = `bold ${Math.min(width * 0.7, 24)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(fingerLabel, posX + width / 2, posY + length / 2)
  }
}
```

### Files touched (Feature 1)

| File | Change |
|------|--------|
| `src/features/player/player.ts` | Add `getWaitingNotes()`, `getHandForNote()`, `getFingerForNote()`, expose as atom |
| `src/features/SongVisualization/falling-notes.ts` | Orange waiting-key coloring, fingering labels on falling notes |
| `src/features/drawing/piano.ts` | `drawFingerLabel()` helper, `fingerLabels` param on `drawPianoRoll()` |
| `src/features/SongVisualization/canvas-renderer.ts` | Pass waiting note data through `GivenState` |

---

## Feature 2: Played/Hit Note Colors on Piano

### What changes

When notes are successfully played (in `hitNotes` set), color the corresponding piano key **blue** for left hand, **green** for right hand.

Currently `getActiveNotes()` only colors "playing" notes (notes currently passing the hit line). We need to also color notes that the user has already hit and is holding.

### Implementation plan

#### Step 2.1 — Track which hit notes are still being held

**File:** `src/features/player/player.ts`

The player already tracks `hitNotes: Set<SongNote>` and `midiPressedNotes: Set<number>`. A note is "actively held" when it's both in `hitNotes` AND the corresponding MIDI key is still pressed:

```typescript
// New method
getHeldHitNotes(): Array<{ midiNote: number; hand: 'left' | 'right' }> {
  const result: Array<{ midiNote: number; hand: 'left' | 'right' }> = []
  for (const note of this.hitNotes) {
    const transposed = this.getTransposedMidi(note.midiNote)
    if (this.midiPressedNotes.has(transposed)) {
      result.push({
        midiNote: note.midiNote,
        hand: this.getHandForNote(note),
      })
    }
  }
  return result
}
```

#### Step 2.2 — Color held hit notes on piano

**File:** `src/features/SongVisualization/falling-notes.ts`

In `getActiveNotes()`, add held hit notes:

```typescript
// Held hit notes → blue (LH) or green (RH)
const heldHits = state.player.getHeldHitNotes()
for (let h of heldHits) {
  const color = h.hand === 'left' ? '#3b82f6' : '#22c55e'  // blue-500 : green-500
  activeNotes.set(h.midiNote, color)
}
```

### Files touched (Feature 2)

| File | Change |
|------|--------|
| `src/features/player/player.ts` | Add `getHeldHitNotes()` |
| `src/features/SongVisualization/falling-notes.ts` | Color held hit notes in `getActiveNotes()` |

---

## Feature 3: Waterfall Note Colors — Blue/Green by Hand

### What changes

Change `HAND_COLORS` to use **blue** for left hand and **green** for right hand (currently orangeish and purple).

### Current colors

```typescript
// src/features/SongVisualization/handColors.ts
left:  { black: '#d1642e', white: '#f08a5b' }  // orange
right: { black: '#5b3ad6', white: '#7b5ff0' }  // purple
```

### New colors

```typescript
left:  { black: '#1d4ed8', white: '#3b82f6' }  // blue-700 / blue-500
right: { black: '#15803d', white: '#22c55e' }  // green-700 / green-500
```

### Implementation plan

#### Step 3.1 — Update HAND_COLORS

**File:** `src/features/SongVisualization/handColors.ts`

Replace color hex values.

#### Step 3.2 — Update SettingsPanel track hand buttons

**File:** `src/pages/play/components/SettingsPanel.tsx`

The SettingsPanel uses `HAND_COLORS` for LH/RH button backgrounds (line 541, 556). These update automatically since they import from `handColors`.

#### Step 3.3 — Verify sheet music colors

**File:** `src/features/SongVisualization/sheet.ts`

Check `getGameColorPrefix()` and `getLearnSongColorPrefix()` — these use `colorMap` constants, not `HAND_COLORS`. Sheet mode should stay with its current color scheme (purple for active notes is the app's brand color and works well on the staff).

### Files touched (Feature 3)

| File | Change |
|------|--------|
| `src/features/SongVisualization/handColors.ts` | Replace hex values (blue/green) |

---

## Feature 4: MIDI Loopback Toggle

### What changes

Add a toggle that prevents MIDI output from being sent to the keyboard. When disabled, MIDI notes played by the app (song playback, metronome, piano roll taps) are NOT forwarded to MIDI output devices — only the internal Web Audio synth produces sound.

### Problem

Current flow causes echo:
```
Piano key press → MIDI input → MidiState.press()
  → pressOutput(note, vol)   // sends note back to piano via MIDI out
  → subscribers notified      // synth plays note with Web Audio
  
Piano receives its own note back → plays sound again → may re-trigger input → loop
```

Also `InstrumentSynth.playNote()` calls `midi.pressOutput()` — when playing song notes, these are sent to the piano which may echo them back as input events.

### Implementation plan

#### Step 4.1 — Add loopback atom

**File:** `src/features/midi/index.tsx`

```typescript
// New atom — defaults to false (loopback OFF = don't send MIDI back to devices)
export const loopbackEnabledAtom = atom<boolean>(false)
```

#### Step 4.2 — Guard pressOutput/releaseOutput

**File:** `src/features/midi/index.tsx`

In `MidiState.pressOutput()` and `releaseOutput()`:

```typescript
pressOutput(note: number, volume: number) {
  const loopbackEnabled = store.get(loopbackEnabledAtom)
  if (!loopbackEnabled) {
    return  // Don't send to external devices
  }
  for (const output of enabledOutputDevices) {
    const midiNoteOnCh1 = 144
    const velocity = volume * 127
    var data = [midiNoteOnCh1, note, velocity]
    output[1]?.send(data)
  }
}

releaseOutput(note: number) {
  const loopbackEnabled = store.get(loopbackEnabledAtom)
  if (!loopbackEnabled) {
    return
  }
  const midiNoteOffCh1 = 128
  for (const output of enabledOutputDevices) {
    var data = [midiNoteOffCh1, note, 127]
    output[1]?.send(data)
  }
}
```

#### Step 4.3 — Guard InstrumentSynth MIDI output

**File:** `src/features/synth/get-synth.ts`

In `InstrumentSynth.playNote()` and `stopNote()`:

```typescript
import { loopbackEnabledAtom } from '../midi'

playNote(note: number, velocity = 127 / 2) {
  const loopbackEnabled = store.get(loopbackEnabledAtom)
  if (!this.metronome && loopbackEnabled) {
    midi.pressOutput(note, this.masterVolume)
  }
  // ... rest of method unchanged
}

stopNote(note: number) {
  const loopbackEnabled = store.get(loopbackEnabledAtom)
  if (!this.metronome && loopbackEnabled) {
    midi.releaseOutput(note)
  }
  // ... rest of method unchanged
}
```

#### Step 4.4 — Add UI toggle in Settings panel

**File:** `src/pages/play/components/SettingsPanel.tsx`

Add a new setting row under "Playback" section:

```tsx
<SettingRow
  icon={<ArrowLeftRight className="h-4 w-4" />}
  title="MIDI Loopback"
  subtitle="Send notes to output devices"
>
  <SidebarSwitch
    isSelected={loopbackEnabled}
    onChange={setLoopbackEnabled}
  />
</SettingRow>
```

#### Step 4.5 — Persist loopback setting

**File:** `src/features/persist/constants.ts`

Add storage key.

**File:** `src/features/persist/hooks.ts` or use `usePersistedState`

Store in localStorage so setting survives page reloads.

#### Step 4.6 — Also add to MIDI Modal (optional enhancement)

**File:** `src/pages/play/components/MidiModal.tsx`

Add a toggle at the top of the Outputs section or as a global setting row.

### Files touched (Feature 4)

| File | Change |
|------|--------|
| `src/features/midi/index.tsx` | Add `loopbackEnabledAtom`, guard `pressOutput`/`releaseOutput` |
| `src/features/synth/get-synth.ts` | Guard `midi.pressOutput`/`releaseOutput` calls in `InstrumentSynth` |
| `src/pages/play/components/SettingsPanel.tsx` | Add "MIDI Loopback" toggle row |
| `src/pages/play/components/MidiModal.tsx` | Optional: add loopback toggle to MIDI modal |
| `src/features/persist/constants.ts` | Add storage key for persistence |
| `src/types.ts` | Add `loopbackEnabled` to `SongConfig` (or keep as standalone setting) |

---

## Color Summary

| State | Color | Hex |
|-------|-------|-----|
| Waiting note (piano key) | Orange | `#f97316` |
| Waiting note (fingering label) | Orange on white circle | `#f97316` |
| Played/hit LH note (piano) | Blue | `#3b82f6` |
| Played/hit RH note (piano) | Green | `#22c55e` |
| Falling note LH | Blue | `#3b82f6` (white key), `#1d4ed8` (black key) |
| Falling note RH | Green | `#22c55e` (white key), `#15803d` (black key) |
| MIDI-pressed note (piano) | Grey | `#808080` |

---

## Implementation Order

Recommended sequence — each step is independently testable:

1. **Feature 3 first** (HAND_COLORS update) — trivial, 1 file, no dependencies
2. **Feature 4 second** (loopback toggle) — standalone, clear benefit
3. **Feature 2 third** (held hit note colors) — depends on Feature 3 colors making sense
4. **Feature 1 last** (wait mode fingering) — most complex, builds on color scheme from 2+3

---

## Testing Checklist

### Feature 1 — Wait Mode Fingering
- [ ] Load any song, enable wait mode, play first note: verify orange key with R1/L1 label
- [ ] Two-note chord in wait mode: verify R1+R2 or L1+L2 labels
- [ ] Labels clear and readable at different zoom levels
- [ ] Labels don't overlap on adjacent black/white keys
- [ ] Fingering consistent when same passage replayed

### Feature 2 — Hit Note Colors
- [ ] Press correct note in wait mode: key turns blue (LH) or green (RH)
- [ ] Release note: key returns to default color
- [ ] Wrong note press: key stays grey (MIDI-pressed), doesn't turn blue/green

### Feature 3 — Waterfall Colors
- [ ] Falling notes show blue for LH, green for RH
- [ ] Settings panel LH/RH buttons match new colors
- [ ] Both falling-notes and sheet mode look correct

### Feature 4 — Loopback Toggle
- [ ] Toggle OFF (default): piano keyboard doesn't echo notes back
- [ ] Toggle ON: notes sent to MIDI output devices
- [ ] Setting persists across page reloads
- [ ] Metronome sounds still work when loopback is OFF (internal synth)

---

## Future Enhancements (out of scope for this plan)

- **Fingering v2:** Scale/arpeggio template matching instead of sequential numbering
- **Custom fingering editor:** User can drag finger numbers to reassign
- **Wait mode pedal awareness:** Parse CC#64 to skip waiting on pedal-held notes
- **Per-song fingering persistence:** Store finger assignments in song settings
- **Fingering import from MusicXML:** Parse `<fingering>` elements
