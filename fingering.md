# Piano Fingering — Comprehensive Reference

Finger numbering, principles, standard patterns, anatomical constraints, and computational approaches. Reference for implementing fingering annotation in sightread.

---

## 1. Finger Numbering System

Universal standard, both hands identical:

| Number | Finger | Characteristics |
|--------|--------|-----------------|
| **1** | Thumb | Shortest, strongest, most mobile. Primary pivot for crossings. |
| **2** | Index | Strong, independent. Good for black keys and fast passages. |
| **3** | Middle | Longest, strongest, most naturally central. Anchor finger. |
| **4** | Ring | **Weakest independent finger.** Shares tendon with 3 and 5. Avoid trills with 4. Often placed on black keys in scales. |
| **5** | Pinky | Short, weak. Used for outer edges of hand position, endings, beginnings. Rarely plays black keys in scale passages except when unavoidable. |

Sheet music notation: small numbers above/below note heads. Only shown at hand-position changes, tricky passages, or first note of a piece.

---

## 2. Core Principles of Good Fingering

### 2.1 The Golden Rules

| # | Rule | Rationale |
|---|------|-----------|
| 1 | **Avoid thumb on black keys** | Short thumb on black key forces wrist forward, breaks legato. Exception: pieces primarily on black keys (Chopin Etude Op.10 No.5), octaves/chords spanning black keys. |
| 2 | **Keep hand in one position as long as possible** | "Cleverly lazy" — minimize hand shifts. Cover maximum notes from current position before moving. |
| 3 | **Use all five fingers** | Don't rely on just 2-3 strongest fingers. Distribute work across all fingers to avoid fatigue. |
| 4 | **Let finger 4 take black keys** | In scale patterns, 4 naturally falls on black keys (it's longer than thumb, shorter than 3). This is a deliberate design choice in standard scale fingerings. |
| 5 | **Serve musical expression** | If a fingering breaks phrasing, articulation, or dynamics — change it. Fingering serves music, not vice versa. |
| 6 | **Choose fingering that works for the whole passage** | A fingering that works for one note but forces an awkward shift later is wrong. Look ahead. |
| 7 | **Consistency builds muscle memory** | Once you pick a fingering, stick to it. Changing fingerings during practice destroys learning. |

### 2.2 Economy of Motion

- Minimize hand position changes (lateral shifts)
- Prefer finger crossings that preserve hand shape
- Thumb crossings (tucking under) preferred over large leaps when legato matters
- For fast passages, lateral hand shift ("thumb over") often better than literal thumb tuck
- Wrist should stay level — avoid vertical bobbing

### 2.3 Comfort Above All

> "There is no single right fingering for everyone — but there are many fingerings that are definitely better than others."

Hand size matters. A comfortable stretch for one pianist may be impossible for another. Standard fingerings are starting points, not absolutes.

---

## 3. Scale Fingerings

### 3.1 The Fundamental Pattern

All standard scale fingerings derive from alternating **groups of 3** (`1-2-3`) and **groups of 4** (`1-2-3-4`). The thumb (1) tucks under to start each new group.

**Why 3+4=7?** A major scale has 7 notes per octave. Group of 3 + group of 4 = 7. The next octave starts again with 1.

### 3.2 Right Hand — All Major Scales (2 octaves)

```
C:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
G:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
D:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
A:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
E:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
B:  1 2 3 1 2 3 4 1 2 3 1 2 3 4 5
F:  1 2 3 4 1 2 3 1 2 3 4 1 2 3 4
Bb: 2 1 2 3 1 2 3 4 1 2 3 1 2 3 4  (or: 4 1 2 3 1 2 3 4...)
Eb: 3 1 2 3 4 1 2 3 1 2 3 4 1 2 3
Ab: 3 4 1 2 3 1 2 3 4 1 2 3 1 2 3
Db: 2 3 1 2 3 4 1 2 3 1 2 3 4 1 2
Gb: 2 3 4 1 2 3 1 2 3 4 1 2 3 1 2
(F#): 2 3 4 1 2 3 1 2 3 4 1 2 3 1 2
```

**Pattern insight:** C, G, D, A, E (sharp-side keys) all use identical `123 1234` pattern. Flat-side keys shift the starting finger so that **finger 4 always lands on the black key** and **thumb stays on white keys**.

### 3.3 Left Hand — All Major Scales (2 octaves)

LH is the mirror of RH descending:

```
C:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
G:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
D:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
A:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
E:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
B:  4 3 2 1 4 3 2 1 3 2 1 4 3 2 1  (varies by edition)
F:  5 4 3 2 1 3 2 1 4 3 2 1 3 2 1
Bb: 3 2 1 4 3 2 1 3 2 1 4 3 2 1 3
Eb: 3 2 1 4 3 2 1 3 2 1 4 3 2 1 3
Ab: 3 2 1 4 3 2 1 3 2 1 4 3 2 1 3
Db: 3 2 1 4 3 2 1 3 2 1 4 3 2 1 3
Gb: 4 3 2 1 3 2 1 4 3 2 1 3 2 1 4
```

**LH rule:** mirror of RH pattern. Thumb and pinky always on white keys. Finger 4 takes black keys.

### 3.4 Minor Scales

**Natural/harmonic/melodic minors follow the same fingering as their relative major or parallel major**, depending on which pattern fits the black-key layout better. General rule:

- **Relative major formula:** minor key fingering = fingering of relative major (e.g., A minor uses C major fingering)
- **Black-key adjustment:** if the minor has more black keys, shift the starting finger per the flat-key patterns above

Key mappings:
```
A minor  → C major fingering    (all white)
E minor  → G major fingering    (all white, one sharp)
B minor  → D major fingering    (all white, two sharps)
F# minor → A major fingering    (all white, three sharps)
C# minor → E major fingering    (all white, four sharps)
D minor  → F major fingering    (one flat)
G minor  → Bb major fingering   (two flats)
C minor  → Eb major fingering   (three flats)
F minor  → Ab major fingering   (four flats)
Bb minor → Db major fingering   (five flats)
Eb minor → Gb major fingering   (six flats)
```

### 3.5 Rule-Based Algorithm for Scale Fingering

Given a key signature, determine the scale fingering:

1. Determine the set of 7 pitch classes in the scale
2. Count how many are black keys
3. **0-1 black keys (C, G, D, A, E, B majors; A, E, B minors):** RH `123 1234...`, LH `54321 321...`
4. **2-5 black keys (F, Bb, Eb, Ab, Db majors; D, G, C, F, Bb minors):** Shift the `123 1234` pattern so thumb lands on white keys and finger 4 lands on black keys
5. **6 black keys (Gb/F#, C# majors; Eb, G# minors):** Thumb on the two white keys (F and B in Gb; E# and B# in C#), all other fingers on black keys

---

## 4. Chord Fingerings

### 4.1 Blocked Triads (Root Position)

All major/minor triads, all keys:

| Hand | Fingering |
|------|-----------|
| Right Hand | **1–3–5** |
| Left Hand | **5–3–1** |

Also common: **1–2–4** (RH) for faster passages or when preparing for next chord.

### 4.2 Triad Inversions

| Inversion | Right Hand | Left Hand |
|-----------|------------|-----------|
| Root position (root in bass) | 1–3–5 | 5–3–1 |
| 1st inversion (3rd in bass) | **1–2–5** | 5–3–1 |
| 2nd inversion (5th in bass) | 1–3–5 | **5–2–1** |

**Why 1–2–5 for 1st inversion RH?** The interval between the bottom two notes is a 4th (wider), so 1–2 is more comfortable than 1–3. The skip to the top note is a 3rd (narrower), so 5 reaches it easily.

### 4.3 Seventh Chords

| Chord Type | RH Fingering | LH Fingering |
|------------|-------------|-------------|
| Dominant 7th | 1–2–3–5 or 1–2–4–5 | 5–4–2–1 or 5–3–2–1 |
| Major 7th | 1–2–3–5 | 5–3–2–1 |
| Minor 7th | 1–2–3–5 | 5–3–2–1 |
| Diminished 7th | 1–2–3–4 or 1–2–3–5 | 5–4–3–1 or 5–3–2–1 |
| Half-diminished 7th | 1–2–3–5 | 5–3–2–1 |

### 4.4 Block Chord Selection Algorithm

```
Given: set of MIDI notes {n1, n2, ...}, hand (L|R)

1. Sort notes ascending
2. Map notes to nearest comfortable finger positions
   - For RH: 1→lowest, 5→highest
   - For LH: 5→lowest, 1→highest
3. Constraint: no finger crossover (finger numbers must be monotonic with pitch)
4. Constraint: avoid 4 on white keys if better alternative exists
5. Preference: thumb on white key when possible
6. Preference: minimize total stretch (sum of semitone distances between adjacent fingers)
```

---

## 5. Arpeggio Fingerings

Arpeggios break chords into sequences. Different from scales because intervals are wider (3rds and 4ths vs 2nds).

### 5.1 White-Key Root Arpeggios (C, G, D, A, E majors; A, E, B, F#, C# minors)

```
RH (2 octaves): 1 2 3 1 2 3 5  [descending: 5 3 2 1 3 2 1]
LH (2 octaves): 5 4 2 1 4 2 1  [descending: 1 2 4 1 2 4 5]
```

RH variant: `1 2 4 1 2 4 5` (using 4 instead of 3 for larger hands or certain keys)

### 5.2 Flat-Key Root Arpeggios (F, Bb, Eb, Ab majors; D, G, C, F, Bb minors)

```
RH: 1 2 4 1 2 4 5  [or 2 1 2 4... for keys starting on black]
LH: 5 4 2 1 4 2 1
```

### 5.3 Black-Key Pattern Groups (Detailed)

| Pattern | Example Keys | RH Root | RH 1st Inv | RH 2nd Inv |
|---------|-------------|---------|------------|------------|
| Black-white-black | Db, Ab, Eb | 4–1–2–4 | 1–2–4–1 | 2–4–1–2 |
| White-black-white | D, A, E | 1–2–3–1 | 3–1–2–3 | 1–2–3–1 |
| White-black-black | B | 1–2–3–1 | 2–3–1–2 | 3–1–2–3 |
| Black-white-white | Bb | 4–1–2–4 | 1–2–4–1 | 1–2–4–1 |

**Key rule:** After a black key, thumb lands on the nearest white key. The pattern adapts to keep thumb on white keys.

### 5.4 Arpeggio Fingering Algorithm

```
1. Identify the chord (root + quality → pitch class set)
2. Map to the nearest pattern group (white-root vs black-root)
3. For each octave:
   a. Start with the group-appropriate starting finger
   b. Position thumb on a white key after each black-key crossing
   c. End the octave on finger 5 (RH ascending) or 1 (LH ascending)
4. Chain octaves with thumb-under crossing
```

---

## 6. Special Techniques

### 6.1 Thumb Crossing (Thumb Under)

**Ascending RH / Descending LH:**
- Thumb passes under finger 3 or 4
- Rotate forearm slightly (don't force thumb sideways)
- Keep wrist level — no vertical bobbing
- Thumb should already be moving toward its target while previous finger is playing

**Descending RH / Ascending LH:**
- Finger 3 or 4 crosses over thumb
- Hand shifts laterally as a unit
- At very fast tempos, "thumb over" (lateral shift without tucking) replaces literal tuck

### 6.2 Finger Substitution

Replace one finger with another on the same key without re-striking:

| Type | Example | Use |
|------|---------|-----|
| Direct | 3→4 on held note | Free finger 3 for next note |
| Thumb substitution | 3→1 on held note | Reposition hand for upcoming passage |
| Silent switch | 5→3 on long note | Prepare for chord change |

Used extensively in fugues, legato melodies, and organ repertoire.

### 6.3 Repeated Notes

Change fingers on repeated notes for speed and legato illusion:

```
Slow: can use same finger
Medium: 3-2-1, 4-3-2, or 3-2-1
Fast: 4-3-2-1 or 5-4-3-2 (rolling motion)
```

### 6.4 Chromatic Scales

```
RH: 1 3 1 3 1 2 3 1 3 1 3 1 2  (standard)
LH: 3 1 3 1 3 2 1 3 1 3 1 3 2  (standard)

Alternative (Liszt): 1 2 3 4 5 for very fast chromatic runs
```

### 6.5 Double Notes (Thirds, Sixths, Octaves)

**Thirds:**
```
RH legato: upper voice 3-4-5, lower voice 1-2-3 (alternating)
RH detached: 1-3, 2-4, 3-5 (finger pairs)
```

**Octaves:**
```
Standard: 1-5 (white keys), 1-4 (black keys)
Legato octaves: 1-5, 1-4, 1-5... or use 1-3, 1-4 on black keys
```

### 6.6 Trills

```
Standard: 2-3 or 1-3 (strongest combination)
Avoid: 3-4 or 4-5 (weak, poor independence)
Black-to-white trill: upper finger on black, lower on white
```

---

## 7. Anatomical Constraints

### 7.1 Hand Span

| Span | Semitones | Population |
|------|-----------|------------|
| Comfortable 1-5 stretch | 10-11 (minor 7th to octave) | Most adults |
| Maximum 1-5 stretch | 12-13 (octave+ to minor 10th) | Large hands only |
| Comfortable 1-3 stretch | 6-7 (tritone to 5th) | Most adults |
| Comfortable 2-5 stretch | 7-8 (5th to minor 6th) | Most adults |

**Implication for fingering algorithms:** Never assign a stretch > 13 semitones between adjacent fingers. Flag stretches > 10 as "large hand only."

### 7.2 Finger Independence

```
Most independent: 2, 3
Moderately independent: 1 (thumb)
Least independent: 4 (shares tendon with 3 and 5), 5
```

**Rules derived from anatomy:**
- Avoid trills involving 4 (3-4, 4-5)
- Avoid rapid repeated 4-5 alternation
- Avoid holding 3-4-5 down while playing 1-2 independently
- Finger 4 on black key is often MORE comfortable (key is elevated, shorter reach needed)
- Finger 5 on black key is acceptable when hand is already positioned over black-key area

### 7.3 Black/White Key Geometry

- Black keys are elevated ~12mm above white keys
- Black keys are narrower (~9mm vs ~23mm for white keys)
- Thumb is short and thick — pressing a black key forces entire hand forward
- Fingers 2-3-4 are longer — black keys are easier for them
- The "in and out" motion: hand slides forward for black-key passages, back for white-key passages

---

## 8. Computational Fingering Approaches

### 8.1 Rule-Based (Heuristic)

**How it works:** Encode anatomical constraints and pedagogical rules as a scoring function. Search over possible fingerings for the one with lowest cost.

**Cost function components:**
- `stretch_cost`: semitone distance between finger positions, weighted by finger pair
- `thumb_on_black_penalty`: high penalty for thumb on black key
- `position_change_cost`: penalty for hand shifts (when consecutive notes can't be reached from one position)
- `finger_repeat_penalty`: small penalty for using same finger consecutively (legato break)
- `crossing_cost`: cost for thumb-under or finger-over crossings
- `weak_finger_penalty`: small cost for using 4 or 5 in exposed positions

**Example scoring:**
```
cost = Σ(
  w1 * stretch_distance(finger_i, finger_i+1, note_i, note_i+1)
  + w2 * thumb_on_black(note_i, finger_i)
  + w3 * position_shift_distance(pos_i, pos_i+1)
  + w4 * is_crossing(finger_i, finger_i+1)
  + w5 * weak_finger_usage(finger_i, note_i)
)
```

Then find the sequence of finger assignments that minimizes total cost (dynamic programming / Viterbi).

### 8.2 Statistical (Hidden Markov Models)

**Key paper:** Nakamura, Saito, Yoshii (2020) — "Statistical Learning and Estimation of Piano Fingering"

Treats fingering as a **sequence labeling problem** (like part-of-speech tagging):
- **Hidden states:** finger numbers (1-5)
- **Observations:** note properties (pitch, duration, position in measure, interval from previous note)
- **Transition model:** probability of moving from finger i to finger j given the musical context
- **Emission model:** probability of a given note being played by a given finger

**Advantage:** Trained on annotated data (e.g., PIG dataset), captures style-specific patterns.

**Disadvantage:** Requires large annotated dataset, may produce physically impossible fingerings in edge cases.

**High-order HMM (3rd order) outperforms LSTM** for this task — the physical constraints are fundamentally Markovian.

### 8.3 Reinforcement Learning

**Key paper:** Gao et al. (2023) — "Generating Fingerings for Piano Music with Model-Based Reinforcement Learning"

- **State:** current hand position (finger on current key), upcoming note sequence
- **Action:** assign finger to next note
- **Reward:** negative cost (minimize stretch, crossings, thumb-on-black, etc.)
- **Model-based RL (prioritized sweeping):** learns environment dynamics, eliminates impossible fingerings

**Advantage:** Can optimize for long-term fluency, not just local decisions.

### 8.4 Hybrid Approach (Recommended for sightread)

```
Phase 1: Rule-based pre-filtering
  - For each note, generate candidate fingers (eliminate impossible ones)
  - Impossible = stretch > 13 semitones, thumb on black (with exceptions), finger crossover

Phase 2: Dynamic programming over candidates
  - Viterbi algorithm minimizing cost function
  - Cost includes: stretch, thumb-on-black, position shifts, weak finger usage

Phase 3: Post-processing
  - Adjust for hand-specific patterns (LH isn't simply mirrored RH)
  - Apply scale/arpeggio template matching (if passage matches known pattern, use standard fingering)
  - Allow user overrides
```

---

## 9. Fingering Data Model

### 9.1 Core Representation

```typescript
// A single fingering annotation
interface NoteFingering {
  noteIndex: number        // index into Song.notes[]
  finger: 1 | 2 | 3 | 4 | 5
  hand: 'left' | 'right'
  substitution?: {         // for finger substitution on held notes
    fromFinger: 1 | 2 | 3 | 4 | 5
    atTime: number         // song time when substitution happens
  }
}

// Complete fingering for a song
interface SongFingering {
  songId: string
  leftHand: NoteFingering[]
  rightHand: NoteFingering[]
  generatedBy?: 'manual' | 'algorithm-v1' | 'template'
}

// Fingering template (reusable pattern)
interface FingeringTemplate {
  name: string             // e.g., "C-major-scale-RH"
  type: 'scale' | 'arpeggio' | 'chord' | 'chromatic' | 'custom'
  keySignature: KEY_SIGNATURE
  hand: 'left' | 'right'
  pattern: number[]        // sequence of finger numbers
  appliesTo: {
    pitchClasses?: number[]  // specific to these notes
    intervals?: number[]     // or this interval pattern (in semitones)
  }
}
```

### 9.2 MIDI-Based Fingering Rules Table

For algorithmic fingering, a lookup table keyed on note distance and hand position:

```typescript
interface FingeringRule {
  // "Given I'm on finger F at pitch P, what finger should play the next note Q?"
  fromFinger: 1 | 2 | 3 | 4 | 5
  intervalSemitones: number
  direction: 'up' | 'down'
  preferredFinger: 1 | 2 | 3 | 4 | 5
  cost: number              // lower = better
  requiresCrossing: boolean
}
```

### 9.3 Storage Format (for sightread)

Could store as:
- **Inline in MIDI:** embed in a custom MIDI meta-event (track-specific text events for fingering)
- **Sidecar JSON:** `song.mid` + `song.fingering.json`
- **In SongConfig:** extend `TrackSetting` with a fingering map: `{ noteIndex: fingerNumber }`
- **MusicXML:** use the standard `<fingering>` element when parsing XML

Recommendation: **sidecar JSON** for flexibility. Align with MusicXML's `<fingering>` element semantics.

---

## 10. Application to Sightread

### 10.1 Where Fingering Fits

Current sightread architecture has no fingering concept. Adding it touches:

| Layer | What changes |
|-------|-------------|
| `types.ts` | Add `Fingering` type to `Song` or `SongConfig` |
| `parsers/` | Parse fingering from MusicXML `<fingering>` elements; extract from MIDI meta-events |
| `player/` | Player already tracks which notes are active — no changes needed |
| `SongVisualization/` | **Render finger numbers** on notes (both falling-notes and sheet modes) |
| `drawing/` | New `drawFingerNumber()` helper alongside existing `drawMusicNote()` |
| `theory/` | Add fingering generation: scale/chord template matching, DP algorithm |
| `persist/` | Store per-song fingerings in localStorage |

### 10.2 Visualization Ideas

**Falling notes mode:** Small circled number in corner of each note block. Color-coded by hand (blue=LH, green=RH).

**Sheet music mode:** Number above/below note head (standard notation convention). Same position as note labels but in different color/style.

**Piano roll:** Numbers on the piano keys themselves (like some method books print numbers on keys).

### 10.3 Generation Pipeline

```
MIDI file
  → parseMidi() → Song
  → detectScalePassages() → scale template match
  → detectArpeggios() → arpeggio template match
  → detectChords() → chord template match
  → for remaining notes → DP cost-minimization
  → merge and resolve conflicts
  → SongFingering
```

### 10.4 Edge Cases to Handle

- **Hand redistribution:** a note written for one hand that's easier to play with the other. Algorithms should consider both hands simultaneously.
- **Polyphonic passages:** multiple voices in one hand. Fingering must respect voice leading.
- **Silent finger substitution:** holding a note while changing fingers (no audible effect, purely physical).
- **Glissando:** not a fingering problem per se; detect and skip.
- **Clusters:** dense chords where standard chord fingering doesn't apply. Fall back to "assign nearest finger."
- **Cross-staff notation:** notes on bass clef played by RH and vice versa.

---

## 11. References

### Books
- Roskell, Penelope. *The Art of Piano Fingering* (2018)
- Verbalis, Jon. *Natural Fingering: A Topographical Approach to Pianism* (Oxford, 2012)
- Banowetz, Joseph. *The Performing Pianist's Guide to Fingering* (2021)
- Palmer, Manus, Lethco. *The Complete Book of Scales, Chords, Arpeggios & Cadences* (Alfred)

### Research Papers
- Nakamura, E., Saito, Y., Yoshii, K. (2020). "Statistical Learning and Estimation of Piano Fingering." *Information Sciences*, 517, 68-85.
- Gao, W. et al. (2023). "Generating Fingerings for Piano Music with Model-Based Reinforcement Learning." *Applied Sciences*, 13(20), 11321.
- Balliauw, M. et al. (2017). "A Variable Neighborhood Search Algorithm to Generate Piano Fingerings for Polyphonic Sheet Music." *International Transactions in Operational Research*, 24(3).
- Kasimi, A., Nichols, E., Raphael, C. (2007). "A Simple Algorithm for Automatic Generation of Polyphonic Piano Fingerings." *ISMIR 2007*.

### Online
- Yamaha Music: "The Basics of Piano Keyboard Fingering" — [hub.yamaha.com](https://hub.yamaha.com/keyboards/k-how-to/the-basics-of-piano-keyboard-fingering/)
- Music Stack Exchange: fingering tag — [music.stackexchange.com](https://music.stackexchange.com/questions/tagged/fingering)
- PIG Dataset (Piano Fingering Dataset) — annotated fingering data for ML training

---

## 12. Hand Splitting — Assigning Notes to Left vs Right Hand

### 12.1 The Problem

MIDI files store notes as raw pitch+time data across tracks. They do NOT inherently encode which hand plays which note. Piano music notation uses two staves (treble = RH, bass = LH), but MIDI tracks don't always split cleanly along those lines. Common issues:

- **Single-track piano MIDI:** All notes on one track. Need algorithmic splitting.
- **Multi-track MIDI with ambiguous labels:** Track names like "Piano 1", "Piano 2", or generic names.
- **Cross-staff notes:** Notes written on bass clef intended for RH (or vice versa), common in advanced repertoire.
- **Three-stave writing:** Some Romantic/contemporary scores use 3 staves (e.g., Rachmaninoff) — middle staff splits between hands.
- **Pedal-sustained notes:** MIDI note-off events are missing or delayed because the pedal holds the note. The note appears "held" when it should have been released.

### 12.2 Standard Hand Division by Pitch Range

The most fundamental heuristic — used by sightread's current `parserInferHands()`:

| Heuristic | Rule |
|-----------|------|
| **Pitch split point** | Middle C (MIDI 60) is the traditional boundary. Notes above → RH, notes below → LH. |
| **Average pitch per track** | If a track's average pitch is higher, it's likely RH. |
| **Two-staff assumption** | Piano music = 2 staves. If exactly 2 tracks with notes, pick the higher-average as RH. |
| **Track name matching** | Look for "Right", "RH", "Treble", "Student", "Lead" → RH. "Left", "LH", "Bass" → LH. |

**Split point refinement — the "C4 rule" and its exceptions:**

```
Standard split: notes ≥ C4 (MIDI 60) → RH, notes < C4 → LH

Exceptions:
- Melody in LH crossing above C4? Check for sustained bass notes. If LH has low notes
  AND high notes, it might be arpeggiated accompaniment — split by voice, not by pitch.
- Chords spanning C4? Assign to whichever hand has fewer active notes.
- Octave doublings? The upper octave → RH, lower → LH (even if both are above C4).
```

### 12.3 Track-Based Splitting (Multi-Track MIDI)

When MIDI has separate tracks per hand (most common for well-authored files):

1. **Name heuristic** (most reliable): match track name against known patterns
2. **Program heuristic**: tracks with piano-family programs (0-6 in GM) are piano tracks
3. **Channel heuristic**: some MIDI authors put LH on channel 1, RH on channel 2
4. **Average pitch heuristic** (fallback): higher average → RH

### 12.4 Note-Level Splitting (Single-Track MIDI)

When all notes are on one track, split algorithmically:

```
Algorithm: splitByHand(notes: SongNote[]) → { left: SongNote[], right: SongNote[] }

1. Sort notes by time
2. For each time slice (simultaneous notes):
   a. Sort notes by pitch descending
   b. If only 1 note: assign to RH (unless below C4 and no recent RH activity → LH)
   c. If 2 notes: higher → RH, lower → LH
   d. If 3+ notes:
      - Split at the largest pitch gap
      - If no clear gap, split at C4 (MIDI 60)
      - Constraint: LH max 5 notes, RH max 5 notes
3. Post-process:
   - Ensure hand continuity (don't flip-flop a melodic line between hands)
   - Group contiguous pitch regions into same hand
   - Allow 1-2 note "borrowing" for cross-staff passages
```

### 12.5 Voice-Based Splitting

Advanced approach — split by musical voice rather than raw pitch:

```
Two-voice texture (melody + accompaniment):
- Top voice (highest pitch at each time slice) → RH
- Bottom voice(s) → LH

Three-voice texture (e.g., Bach fugues):
- Soprano → RH
- Alto → split between hands based on range
- Bass → LH
- Rule: no hand plays more than 2 voices simultaneously (3+ is physically challenging)

Four-voice texture (hymns, chorales):
- Soprano + Alto → RH
- Tenor + Bass → LH
- Standard split: tenor uses stem-down in bass clef, but played by RH if tenor is high
```

### 12.6 Pedal and Note Duration Handling

**Critical for sightread's wait mode.** MIDI files often encode pedal-sustained durations as extended note lengths instead of using proper MIDI note-off events. This causes "held notes" that the pianist already released.

**Detection strategies:**

| Indicator | Meaning |
|-----------|---------|
| Note duration > 2 seconds with pedal markings | Likely held by pedal, not finger — should NOT block wait mode |
| Overlapping notes with same pitch | The first note-off is the real release; subsequent overlaps are re-strikes |
| Note extends past next instance of same pitch | Impossible to hold physically — it's pedal, not finger |
| Note velocity drops to 0 in MIDI (note-off) | Explicit release — trust this over duration |
| Sustain pedal CC (CC#64) active | Notes during active pedal should have reduced wait-mode requirements |
| Sostenuto pedal CC (CC#66) active | Only specific held notes are sustained |

**Rules for wait mode:**

1. If sustain pedal (CC#64 > 0) is active at time T, any note whose **physical** duration ended (note-off received) but whose **notated** duration continues is **NOT waiting** — it's being held by pedal.
2. If a note-off event exists at time T_off, the note stops waiting at T_off regardless of the MIDI `duration` field.
3. A note re-struck at the same pitch cancels the previous hold — only the NEW instance matters for wait mode.
4. For MIDI files WITHOUT note-off events (some exports): use a maximum physical hold duration of ~2 seconds. Notes held longer than this are assumed pedal-sustained.

### 12.7 Hand Size and Reach Constraints

Maximum simultaneous span per hand:

| Hand | Max Span | Notes |
|------|----------|-------|
| Small hand | 7-8 semitones (perfect 5th to minor 6th) | e.g., C-G to C-Ab |
| Average hand | 9-10 semitones (major 6th to minor 7th) | e.g., C-A to C-Bb |
| Large hand | 11-13 semitones (octave to minor 10th) | e.g., C-C to C-Eb |

**Implications for splitting:**
- If a chord spans > 10 semitones, it MUST be split between hands or rolled
- If total span of all simultaneous notes > 20 semitones, both hands are required
- Octave (12 semitones) is the most common hand-splitting boundary

### 12.8 Data Model for Hand Assignment

```typescript
interface HandAssignment {
  noteIndex: number       // index into Song.notes[]
  hand: 'left' | 'right'
  finger?: 1 | 2 | 3 | 4 | 5
  fingerLabel?: string    // e.g., "R1", "L3" for display
  isPedalHeld?: boolean   // true if note sustained by pedal, not finger
  confidence: number      // 0-1, how confident the algorithm is in this assignment
  source: 'track-name' | 'pitch-heuristic' | 'voice-analysis' | 'manual'
}

interface SongHandSplit {
  songId: string
  splitPoint?: number     // MIDI note number dividing LH/RH (if pitch-based)
  assignments: HandAssignment[]
  generatedBy: string
}
```

### 12.9 How This Applies to Sightread's Wait Mode

Current problem: MIDI files show notes as held even when pedal markings indicate otherwise.

**Solution path:**
1. Parse sustain pedal events (CC#64) from MIDI during `parseMidi()`
2. In `Player.processScoreData()` or `playLoop_()`, check: is sustain pedal active? If yes, don't mark pedal-held notes as "waiting"
3. For MIDI files without CC#64, use the 2-second max-hold heuristic
4. Display distinction in UI: pedal-held notes shown dimmer, finger-held notes shown bright

**Fingering display in wait mode:**
1. Identify which notes are waiting (current `lateNotes` set)
2. Assign finger numbers using hand-split rules above
3. On piano roll: color waiting keys orange, overlay finger label (R1, L2, etc.)
4. On falling notes: color waiting note blocks orange with finger number
5. On sheet music: show finger number above/below waiting note heads
