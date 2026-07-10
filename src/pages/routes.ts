import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('./home/page.tsx'),
  route('songs', './songs/page.tsx'),
  route('play', './play/page.tsx'),
  route('freeplay', './freeplay/page.tsx'),
  route('miditools', './miditools/page.tsx'),
  route('miditools/basicpitch', './miditools/basicpitch.tsx'),
] satisfies RouteConfig
