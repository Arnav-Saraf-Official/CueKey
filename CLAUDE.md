# Sightread

Web app for learning piano. Plug in a MIDI keyboard, load songs, practice sight-reading. Browser-only, no server — SPA built with React Router v7.

## Tech stack

- **Runtime:** Bun (package manager, test runner, scripts)
- **Framework:** React Router v7 (SPA mode, `ssr: false`)
- **Bundler:** Vite with `@react-router/dev/vite`, Tailwind v4 via `@tailwindcss/vite`
- **State:** Jotai (atoms throughout, no React Context except PlayerProvider + Radix Toast/Tooltip providers)
- **Styling:** Tailwind CSS v4 + `tailwind-merge` + `tailwind-variants` + `tailwindcss-react-aria-components`
- **UI primitives:** Radix UI (Toast, Tooltip, Slider), React Aria Components (Select, ComboBox, etc.)
- **MIDI:** `@tonejs/midi` for parsing/serializing, Web MIDI API for device I/O
- **Audio:** Web Audio API with GM soundfonts (FluidR3, fetched from `/soundfonts/`), `wasm-media-encoders` for MP3 export
- **Persistence:** localStorage (song settings) + `idb-keyval` (directory handles for File System Access API)
- **Data fetching:** SWR immutable (`useSWRImmutable`) for loading song data
- **Testing:** Bun test + jsdom

## Source layout

```
src/
├── pages/            # React Router file-based routes (appDirectory: "src/pages")
│   ├── routes.ts     # Route config: /, /about, /freeplay, /play, /songs, /training/*
│   ├── root.tsx      # Root layout (HTML shell, GA, meta tags) + App wrapper
│   ├── providers.tsx # PlayerProvider + ToastProvider + TooltipProvider
│   ├── home/         # Landing page with hero + featured songs preview
│   ├── songs/        # Song browser table + folder management
│   ├── play/         # Main play screen (visualizer + transport + settings)
│   ├── freeplay/     # Free-form keyboard with instrument picker + MIDI recording
│   ├── about/        # Static about page
│   └── training/
│       ├── phrases/  # Procedurally generated phrase reading practice
│       └── speed/    # Note-identification speed drills
├── features/         # Domain logic, organized by concern
│   ├── analytics/    # Google Analytics tracking ID
│   ├── audio/        # Offline MIDI → MP3 renderer
│   ├── controls/     # Instrument picker, song scrub bar, volume slider
│   ├── data/         # Song fetching (useSong, useSongManifest)
│   ├── drawing/      # Canvas primitives (piano keys, staff lines, notes, glyphs)
│   ├── midi/         # Web MIDI I/O, keyboard-to-MIDI, MIDI recording
│   ├── parsers/      # MIDI parsing (tonejs), MusicXML parsing, hand inference
│   ├── persist/      # LocalStorage wrapper, per-song settings, folder scanning
│   ├── player/       # **Core Player class** + React context provider
│   ├── pointer/      # Pointer event tracking for touch/click on piano
│   ├── SongPreview/  # Mini song preview component
│   ├── SongVisualization/ # Canvas renderer orchestration + utils + falling-notes + sheet renderers
│   ├── synth/        # Web Audio GM synthesizer with soundfont loading
│   ├── theory/       # Key signatures, note names, transposition, glyphs
│   └── wakelock/     # Screen wake lock for mobile practice
├── components/       # Reusable UI components (AppBar, Canvas, Modal, Select, etc.)
├── hooks/            # Generic hooks (useSize, useEventListener, useRafLoop, etc.)
├── icons/            # SVG icon components (Logo, LeftHand, RightHand, etc.)
├── utils/            # General utilities (clamp, round, cn, base64, etc.)
├── manifest.json     # Built-in song catalog (17 classical pieces)
└── types.ts          # Core types: Song, SongNote, SongMeasure, SongConfig, SongMetadata, etc.
```

## Core architecture

### Song data model

MIDI files parsed into a `Song` object ([src/types.ts](src/types.ts)):
- `notes: SongNote[]` — every note with `midiNote`, `time`, `duration`, `track`, `velocity`, `measure`
- `measures: SongMeasure[]` — measure boundaries with `time`, `duration`, `number`
- `tracks: Tracks` — track metadata (instrument name, program number)
- `bpms: Bpm[]` — tempo change events
- `timeSignatures` / `timeSignature` — meter info
- `keySignature` — detected key (or undefined if ambiguous)
- `items` — merged `[...notes, ...measures]` sorted by time (used for rendering)
- `ppq`, `secondsToTicks`, `ticksToSeconds` — time conversion helpers

### Player class ([src/features/player/player.ts](src/features/player/player.ts))

Central state machine. Instantiated once, stored in React context.

**States:** `CannotPlay` → `Paused` → `CountingDown` → `Playing`

**Key responsibilities:**
- Song loading: `setSong(song, config)` — loads synths per track, applies config
- Playback loop: `setInterval` at 1ms, advances `currentSongTime` via `performance.now()` delta × `bpmModifier`
- Note scheduling: iterates `song.notes[currentIndex]`, plays notes when their time arrives
- Scoring: `processScoreData(midiNote)` — compares MIDI input against upcoming/late notes within `PERFECT_RANGE` (50ms) and `GOOD_RANGE` (300ms)
- Wait mode: pauses song time when next note isn't hit yet
- Looping: range selection snaps to measure boundaries, seeks back on loop
- Countdown: metronome ticks before playback starts (configurable beats)
- Metronome: tick sounds at configurable subdivisions

**Key atoms:**
- `state` — current PlayerState
- `song` — current Song
- `score.perfect/good/missed/error/durationHeld/combined/accuracy/streak`
- `bpmModifier` — speed multiplier
- `volume`, `metronomeVolume`, `metronomeEnabled`, `metronomeSpeed`
- `transpose` — semitone transpose
- `range` — loop range `[start, end]`
- `countdownEnabled`, `countdownTotal`, `countdownRemaining`

### Scoring

- `perfect`: hit within 50ms → +100 points
- `good`: hit within 300ms → +50 points
- `error`: wrong note → -25 points, resets streak
- `missed`: note passed without being hit → resets streak
- `durationHeld`: +1 per frame per held note (rewards holding notes)
- `combined = perfect*100 + good*50 - error*25 + durationHeld`
- `accuracy = (perfect+good) / (perfect+good+missed+error) * 100`

### MIDI input pipeline

1. `MidiState` class ([src/features/midi/index.tsx](src/features/midi/index.tsx)) — singleton
2. Listens to Web MIDI input devices (auto-enables non-"through" ports)
3. Also maps computer keyboard to MIDI notes (3 octaves, 2 rows)
4. Emits `MidiStateEvent` (`{type: 'down'|'up', note, velocity, time}`)
5. Subscribers: `Player.processMidiEvent()` (for scoring), `synth.playNote()` (for sound on play page), freeplay page

### Audio pipeline

- **Synth** ([src/features/synth/get-synth.ts](src/features/synth/get-synth.ts)): Web Audio API, loads GM soundfonts from `/soundfonts/FluidR3_GM/{instrument}-mp3.js`
- `SynthStub` — lazy-loading wrapper (returns immediately, loads instrument async)
- `InstrumentSynth` — real synth with per-note gain nodes, exponential release ramp
- Metronome uses `woodblock` (regular) + `agogo` (accented) synth stubs
- MIDI output also sent to enabled output devices (for external synths)

### Visualization modes

**Falling notes** ([src/features/SongVisualization/falling-notes.ts](src/features/SongVisualization/falling-notes.ts)):
- Piano roll at bottom, notes fall downward
- Octave ruler lines (C=bold, F=subtle)
- Measure markers with numbers
- Note colors by hand (left=blue, right=green, varies by white/black key)
- Loop range overlay in purple
- Configurable note labels (alphabetical, fixed-do solfège, or none)
- Pixels per second constant: 225

**Sheet music** ([src/features/SongVisualization/sheet.ts](src/features/SongVisualization/sheet.ts)):
- Grand staff (treble + bass) with curly brace
- Notes scroll leftward, play line at fixed X position
- Key signature, time signature, clefs drawn in static overlay
- Ledger lines, accidentals, note trails
- MIDI-pressed keys shown at play line in red (or colored by note)
- Game mode: hit notes colored purple, missed notes gray

**Renderer dispatch** ([src/features/SongVisualization/canvas-renderer.ts](src/features/SongVisualization/canvas-renderer.ts)):
- `render(state)` → calls `renderFallingVis` or `renderSheetVis` based on `state.visualization`
- `GivenState` carries time, config, canvas, items, hand settings, etc.
- Touch scroll support for falling notes mode

### Drawing primitives

- **Piano** ([src/features/drawing/piano.ts](src/features/drawing/piano.ts)): exact key geometry, press/drag detection, image-based black keys
- **Sheet** ([src/features/drawing/sheet.ts](src/features/drawing/sheet.ts)): staff lines, clefs, notes, accidentals, key/time signatures, ledger lines — all using Leland music font glyphs

### Data flow

1. `src/manifest.json` → built-in song metadata list
2. `useSongManifest()` → merged atom of builtin + local (scanned folder) songs
3. User picks song → navigates to `/play?source=builtin&id=arabesques.mid`
4. `PlaySongPage` calls `useSong(id, source)` → SWR fetches + parses MIDI
5. `getSongSettings(id, song)` → merges defaults with persisted settings
6. `player.setSong(song, config)` → loads synths, sets up tracks
7. Canvas render loop (`requestAnimationFrame` via `Canvas` component) reads `player.getTime()`
8. User plays MIDI keyboard → `player.processMidiEvent()` → scoring

### Persistence

- **Song settings:** localStorage via `Storage` wrapper ([src/features/persist/storage.ts](src/features/persist/storage.ts)), keyed as `{file}/settings`
- **Folder handles:** `idb-keyval` stores `FileSystemDirectoryHandle` references for local MIDI files
- **Song config:** per-song `SongConfig` with hand assignments, instrument choices, metronome, loop, visualization mode, transpose, note labels, colored notes, skip-missed-notes

### Song sources

- `builtin` — fetched from `/music/songs/{id}`, parsed client-side
- `local` — File System Access API, folder handles persisted in IndexedDB
- `base64` — used for recordings (encoded MIDI bytes in URL)
- `generated` — procedural songs from training mode

### Modes/pages

| Route | Purpose | Key props |
|-------|---------|-----------|
| `/` | Home/landing | Hero, featured songs, marketing cards |
| `/songs` | Song browser | Table with search/sort, folder management |
| `/play?source=&id=` | Main practice | Visualizer, transport, settings, scoring |
| `/freeplay` | Free keyboard | Instrument picker, MIDI recording |
| `/about` | Static info | Articles about sight-reading |
| `/training/phrases` | Phrase training | Procedural sheet music, game scoring |
| `/training/speed` | Speed drills | Note identification against timer |

### Scripts ([scripts/](scripts/))

- `generate.ts` — generate MIDI files for Irish folk tunes (backing tracks, L/R hands, levels)
- `render.ts` — render MIDI to MP3 using soundfonts (offline audio rendering)
- `detect-good-song.ts` — song quality detection
- `generate-score-meta.ts` — score metadata generation
- `songdata.ts` — song data utilities
- `utils.ts` — script utilities

### Key patterns

- **Lazy singletons:** `getSynthStub()` returns immediately, loads async. `useLazyStableRef()` creates objects once.
- **Atom-based config:** Nearly all player state is Jotai atoms — components subscribe granularly.
- **Canvas rendering:** `Canvas` component ([src/components/Canvas.tsx](src/components/Canvas.tsx)) wraps a `<canvas>`, calls `render(ctx, size)` on each animation frame.
- **SSR safety:** `isBrowser()` guard on Web APIs. `ssr: false` in react-router config.
- **No backend.** Everything runs client-side. Soundfonts served as static `.js` files.

## Adding features

Common touch points:
- New visualization mode: add renderer in `SongVisualization/`, wire into `canvas-renderer.ts`
- New song setting: add to `SongConfig` in `types.ts`, defaults in `getDefaultSongSettings()`, UI in `SettingsPanel`
- New training mode: add page in `pages/training/`, add route in `routes.ts`
- New instrument/sound: add to `synth/instruments.ts`, ensure soundfont exists in `/public/soundfonts/`
- MIDI feature: modify `MidiState` class in `features/midi/index.tsx`
- Scoring changes: modify `Player.processScoreData()` and `Player.processMidiEvent()`
