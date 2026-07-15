import { AppBar } from '@/components'
import { Music, FileAudio, Hand, Youtube } from 'lucide-react'
import { Link } from 'react-router'

const tools = [
  {
    label: 'BasicPitch',
    subtitle: 'MIDI Extractor',
    icon: <Music className="h-5 w-5" />,
    description: 'Spotify\'s ML model for polyphonic MIDI transcription from audio files.',
    to: '/miditools/basicpitch',
  },
  {
    label: 'Bytedance Midi Extractor',
    subtitle: 'MIDI Extractor',
    icon: <FileAudio className="h-5 w-5" />,
    description: 'Bytedance\'s high-accuracy MIDI extraction from audio recordings.',
  },
  {
    label: 'Piano Hands',
    subtitle: 'Hand Splitter',
    icon: <Hand className="h-5 w-5" />,
    description: 'Algorithmically split single-track MIDI into left and right hand parts.',
  },
  {
    label: 'YT Mp3 Download',
    subtitle: 'Audio Source',
    icon: <Youtube className="h-5 w-5" />,
    description: 'Download audio from YouTube videos for MIDI extraction.',
  },
]

export default function MidiTools() {
  return (
    <>
      <title>MIDI Tools</title>
      <div className="flex min-h-screen flex-col bg-[#0f1014] text-white">
        <AppBar />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-2xl flex-col items-center gap-10 text-center">
            {/* Hero */}
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl font-extralight tracking-tight">MIDI Tools</h1>
              <p className="max-w-md text-base text-gray-400">
                Tools to process MIDI files, extract notes from audio, and prepare songs for practice in Sightread.
              </p>
            </div>

            {/* Tool buttons */}
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {tools.map((tool) =>
                'to' in tool && tool.to ? (
                  <Link
                    key={tool.label}
                    to={tool.to}
                    className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                        {tool.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{tool.label}</p>
                        <p className="text-xs text-gray-500">{tool.subtitle}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">{tool.description}</p>
                  </Link>
                ) : (
                <button
                  key={tool.label}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                      {tool.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{tool.label}</p>
                      <p className="text-xs text-gray-500">{tool.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{tool.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
