import { getBasePath } from '../utils/basePath';

/** Every sound effect, by what it is for. The files are CC0 clips from Kenney's "Casino Audio" and "Interface Sounds"
 * packs, in web/public/sounds (licences alongside). */
export const SOUNDS = {
  click: 'click',
  toggle: 'toggle',
  success: 'success',
  error: 'error',
  notify: 'notify',
  spinStart: 'spin-start',
  spinResult: 'spin-result',
  pick: 'pick',
  achievement: 'achievement',
  beaten: 'beaten',
  countdown: 'countdown',
  metronome: 'metronome',
  go: 'go',
  out: 'out',
  outMe: 'out-me',
  win: 'win',
  collect: 'collect',
  action: 'action',
} as const;

export type SoundName = keyof typeof SOUNDS;

const KEY = 'sq-sound';
/** Quiet enough to sit under music or a call. */
const VOLUME = 0.5;
/** The same sound twice inside this window plays once, so a burst of events (ten coins in one snapshot) is one sound, not a buzz. */
const MIN_GAP_MS = 70;

/** Whether sound effects are on for this person: on unless they turned them off. Remembered in this browser. */
export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  muted = !on;
}

let muted = !soundOn();
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundName, number>();

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    gain = ctx.createGain();
    gain.gain.value = VOLUME;
    gain.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function load(name: SoundName, c: AudioContext): Promise<AudioBuffer | null> {
  let buffer = buffers.get(name);
  if (!buffer) {
    buffer = fetch(`${getBasePath()}/sounds/${SOUNDS[name]}.ogg`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, buffer);
  }
  return buffer;
}

/** Plays a sound effect, unless sound is off or the browser has not let the page make noise yet (it never has before the first tap or key press).
 * Never throws: a missing or undecodable file is silence. `rate` nudges the pitch, e.g. a little higher for each step of a combo. */
export function playSound(name: SoundName, rate = 1): void {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(name, now);
  const c = context();
  if (!c || !gain) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  void load(name, c).then((buffer) => {
    if (!buffer || !gain || c.state !== 'running') return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    source.start();
  });
}
