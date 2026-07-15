import { Popover, Slider, Tooltip } from '@/components'
import { useSongScrubTimes } from '@/features/controls'
import { usePlayer } from '@/features/player'
import { Check, Gauge, Hourglass, Metronome, Pause, Play, Repeat, SkipBack, Volume2 } from '@/icons'
import { round } from '@/utils'
import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import React, { useCallback, useEffect, useState } from 'react'
import { Button, Menu, MenuItem, MenuTrigger, TooltipTrigger } from 'react-aria-components'
import { SPEED_PRESETS } from './speedPresets'

type TransportBarProps = {
  isPlaying: boolean
  isLoading: boolean
  onTogglePlaying: () => void
  onClickRestart: () => void
  isLooping: boolean
  onToggleLoop: () => void
  isWaiting: boolean
  onToggleWaiting: () => void
  isMetronomeOn: boolean
  onToggleMetronome: () => void
}

export default function TransportBar({
  isPlaying,
  isLoading,
  onTogglePlaying,
  onClickRestart,
  isLooping,
  onToggleLoop,
  isWaiting,
  onToggleWaiting,
  isMetronomeOn,
  onToggleMetronome,
}: TransportBarProps) {
  const player = usePlayer()
  const { currentTime, duration } = useSongScrubTimes()
  const bpmModifier = useAtomValue(player.getBpmModifier())
  const volume = useAtomValue(player.volume)
  const measure = player.getMeasureForTime(player.getTime())?.number ?? 1
  const isBpmModified = Math.abs(bpmModifier - 1) > 0.001

  // Shift-key snap-to-preset for speed slider
  const [shiftHeld, setShiftHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const handleSpeedChange = useCallback(
    (val: number) => {
      if (shiftHeld) {
        let best = SPEED_PRESETS[0]
        let bestDist = Math.abs(val - best)
        for (const p of SPEED_PRESETS) {
          const d = Math.abs(val - p)
          if (d < bestDist) { bestDist = d; best = p }
        }
        player.setBpmModifier(best)
      } else {
        player.setBpmModifier(Math.round(val * 100) / 100)
      }
    },
    [player, shiftHeld],
  )

  return (
    <div className="flex h-12 items-center justify-between border-t border-[#23242b] bg-[#141419] px-4 text-gray-200">
      <div className="flex items-center gap-3">
        <Button
          className="text-gray-400 transition hover:text-white"
          onPress={onClickRestart}
          onMouseDown={(event) => event.preventDefault()}
        >
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button
          className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.35)] transition hover:bg-emerald-500 active:scale-95"
          onPress={onTogglePlaying}
          onMouseDown={(event) => event.preventDefault()}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>
        <div className="flex items-center gap-2 pl-2">
          <Volume2 className="h-4 w-4 text-gray-400" />
          <div className="w-24">
            <Slider
              orientation="horizontal"
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={(val) => player.setVolume(val[0])}
              className="h-2 w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end select-none">
          <div className="flex items-baseline gap-1 font-mono select-none">
            <span className="text-sm font-semibold text-white select-none">{currentTime}</span>
            <span className="text-[11px] text-gray-500 select-none">/ {duration}</span>
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-emerald-400 uppercase select-none">
            Measure {measure}
          </span>
        </div>
        <div className="hidden h-6 w-px bg-[#2a2b32] md:block" />
        <div className="hidden items-center gap-2 md:flex">
          <TogglePill
            isActive={isMetronomeOn}
            label="Metronome"
            icon={<Metronome />}
            onPress={onToggleMetronome}
          />
          <TogglePill
            isActive={isWaiting}
            label="Wait mode"
            icon={<Hourglass />}
            content="Wait"
            onPress={onToggleWaiting}
          />
          <MenuTrigger>
            <TooltipTrigger>
              <Button
                className={clsx(
                  'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition',
                  isBpmModified
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                    : 'border-transparent bg-[#1e2028] text-gray-300 hover:bg-[#232633]',
                )}
              >
                <Gauge
                  className={
                    isBpmModified ? 'h-3.5 w-3.5 text-emerald-200' : 'h-3.5 w-3.5 text-gray-400'
                  }
                />
                {Math.round(bpmModifier * 100)}%
              </Button>
              <Tooltip>Playback speed{shiftHeld ? ' · snap' : ''}</Tooltip>
            </TooltipTrigger>
            <Popover placement="bottom" className="min-w-[160px] rounded-lg border border-white/10 bg-[#1e1e24] p-3 text-sm shadow-xl">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-gray-500">25%</span>
                <Slider
                  orientation="horizontal"
                  aria-label="Speed"
                  min={0.25}
                  max={2}
                  step={0.01}
                  value={[bpmModifier]}
                  onValueChange={([v]) => handleSpeedChange(v)}
                  className="h-2 flex-1"
                />
                <span className="text-[10px] font-mono text-gray-500">200%</span>
              </div>
              <div className="mt-1.5 text-center text-[10px] text-gray-500">
                {Math.round(bpmModifier * 100)}%{shiftHeld ? ' · hold Shift to snap' : ' · hold Shift for presets'}
              </div>
            </Popover>
          </MenuTrigger>
        </div>
        <div className="h-6 w-px bg-[#2a2b32]" />
        <TogglePill
          isActive={isLooping}
          label="Loop"
          icon={<Repeat />}
          content="Loop"
          onPress={onToggleLoop}
        />
      </div>
    </div>
  )
}

type TogglePillProps = {
  isActive: boolean
  label: string
  icon: React.ReactElement<{ className: string }>
  content?: React.ReactNode
  onPress: () => void
  showStateText?: boolean
}

function TogglePill({
  isActive,
  label,
  icon,
  content,
  onPress,
  showStateText = true,
}: TogglePillProps) {
  const iconClasses = isActive ? 'h-3.5 w-3.5 text-emerald-200' : 'h-3.5 w-3.5 text-gray-400'
  const styledIcon = React.cloneElement(icon, { className: iconClasses })
  const showContent = content !== undefined || showStateText
  return (
    <TooltipTrigger>
      <Button
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
          isActive
            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
            : 'border border-transparent bg-[#1e2028] text-gray-300 hover:bg-[#232633]'
        }`}
        onPress={onPress}
        onMouseDown={(event) => event.preventDefault()}
      >
        {styledIcon}
        {showContent &&
          (content ? (
            <span className="min-w-7 text-center">{content}</span>
          ) : (
            <span className="relative inline-flex min-w-7 justify-center">
              <span className="invisible">OFF</span>
              <span
                className={clsx(
                  'absolute inset-0 flex items-center justify-center transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              >
                ON
              </span>
              <span
                className={clsx(
                  'absolute inset-0 flex items-center justify-center transition-opacity',
                  isActive ? 'opacity-0' : 'opacity-100',
                )}
              >
                OFF
              </span>
            </span>
          ))}
      </Button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}
