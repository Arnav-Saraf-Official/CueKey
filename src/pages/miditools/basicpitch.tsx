import { AppBar, Sizer } from '@/components'
import { bytesToBase64 } from '@/utils'
import { BasicPitch, noteFramesToTime, outputToNotesPoly, addPitchBendsToNoteEvents } from '@spotify/basic-pitch'
import type { NoteEventTime } from '@spotify/basic-pitch'
import { Midi } from '@tonejs/midi'
import { ArrowLeft, Download, FileAudio, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'

type Status = 'idle' | 'loading-model' | 'processing' | 'done' | 'error'

export default function BasicPitchPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [midiBytes, setMidiBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bpRef = useRef<BasicPitch | null>(null)

  async function ensureModel(): Promise<BasicPitch> {
    if (bpRef.current) return bpRef.current
    setStatus('loading-model')
    const bp = new BasicPitch('/basic-pitch-model/model.json')
    // Wait for model to load by running a tiny dummy inference
    await bp.model
    bpRef.current = bp
    return bp
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setError('')
    setMidiBytes(null)

    try {
      // 1. Load model
      const bp = await ensureModel()

      // 2. Decode audio
      setStatus('processing')
      setProgress(0)
      const audioCtx = new AudioContext()
      const arrayBuffer = await file.arrayBuffer()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      audioCtx.close()

      // 3. Run inference
      const frames: number[][] = []
      const onsets: number[][] = []
      const contours: number[][] = []

      await bp.evaluateModel(
        audioBuffer,
        (f, o, c) => {
          frames.push(...f)
          onsets.push(...o)
          contours.push(...c)
        },
        (p) => setProgress(Math.round(p * 100)),
      )

      // 4. Convert to MIDI
      const notes = noteFramesToTime(
        addPitchBendsToNoteEvents(
          contours,
          outputToNotesPoly(frames, onsets, 0.25, 0.25, 5),
        ),
      ) as NoteEventTime[]

      if (notes.length === 0) {
        setError('No notes detected in the audio. Try a different file.')
        setStatus('error')
        return
      }

      // 5. Build MIDI file using @tonejs/midi
      const midi = new Midi()
      const track = midi.addTrack()
      for (const note of notes) {
        track.addNote({
          midi: note.pitchMidi,
          time: note.startTimeSeconds,
          duration: note.durationSeconds,
          velocity: note.amplitude,
        })
      }
      midi.header.tempos = [{ bpm: 120, ticks: 0 }]

      setMidiBytes(midi.toArray())
      setProgress(100)
      setStatus('done')
    } catch (e) {
      console.error('BasicPitch error:', e)
      setError((e as Error).message || 'Failed to process audio.')
      setStatus('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleDownload() {
    if (!midiBytes) return
    const arr = new Uint8Array(midiBytes)
    const blob = new Blob([arr], { type: 'audio/midi' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.[^.]+$/, '') + '.mid'
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = status === 'loading-model' || status === 'processing'

  return (
    <>
      <title>BasicPitch — MIDI Extractor</title>
      <div className="flex min-h-screen flex-col bg-[#0f1014] text-white">
        <AppBar />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
            <Link
              to="/miditools"
              className="flex items-center gap-1 text-sm text-gray-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              MIDI Tools
            </Link>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-extralight tracking-tight">BasicPitch</h1>
              <p className="text-sm text-gray-400">
                Upload an audio file to extract MIDI notes using Spotify's ML model.
                Supports polyphonic transcription.
              </p>
            </div>

            {/* Upload zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-white/15 p-10 transition hover:border-emerald-500/40 hover:bg-white/[0.02]"
            >
              {isLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
              ) : (
                <Upload className="h-10 w-10 text-gray-500" />
              )}
              <p className="text-sm font-medium text-gray-300">
                {isLoading
                  ? status === 'loading-model'
                    ? 'Loading model...'
                    : `Processing — ${progress}%`
                  : 'Drop an audio file here or click to browse'}
              </p>
              <p className="text-xs text-gray-500">MP3, WAV, OGG, FLAC, M4A</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>

            {/* Progress bar */}
            {status === 'processing' && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="w-full rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Done — download */}
            {status === 'done' && midiBytes && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 active:bg-emerald-700"
              >
                <Download className="h-4 w-4" />
                Download MIDI ({fileName.replace(/\.[^.]+$/, '')}.mid)
              </button>
            )}

            <Sizer height={24} />
          </div>
        </div>
      </div>
    </>
  )
}
