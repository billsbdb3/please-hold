/**
 * CCTV — camera scenes (data layer).
 *
 * Phase 2 (docs/DESIGN.md §6) puts the player behind the call centre's own
 * cameras, in the spirit of the Jim Browning footage. The joke, per the style
 * guide (§9), is that surveillance of an office is profoundly boring: an empty
 * corridor, a kettle, a man asleep. Nothing happens, at length, and the game
 * reports it in a flat administrative register. The container is the straight man.
 *
 * This module is pure data plus two pure functions (a deterministic scene
 * stepper and a timestamp formatter). It knows nothing about rendering, so the
 * renderer (Cam.svelte) stays generic and Phase 2 can drop it in unchanged.
 *
 * There is NO Math.random in this file, by design and by test. Every scrap of
 * "ambient life" is a deterministic function of an integer tick, so a given
 * (scene, tick) always produces the same frame — reproducible, testable, and
 * cheap enough to drive 14 cameras from one clock.
 */

/* ------------------------------------------------------------------ shapes */

/**
 * A declarative vocabulary of primitives. The renderer maps each to crude,
 * blobby, low-fidelity SVG — crude reads as authentic 1990s hardware and is
 * achievable in code. Coordinates are in a 0..100 scene box; the renderer
 * scales to the frame.
 */
export type Shape =
  | { kind: 'floor'; y: number }
  | { kind: 'wall'; x: number; w: number }
  | { kind: 'door'; x: number; y: number; w: number; h: number; open: boolean }
  | { kind: 'desk'; x: number; y: number; w: number }
  | { kind: 'chair'; x: number; y: number; pushedBack: boolean }
  | { kind: 'figure'; x: number; y: number; pose: FigurePose }
  | { kind: 'blob'; x: number; y: number; r: number }
  | { kind: 'kettle'; x: number; y: number }
  | { kind: 'monitor'; x: number; y: number; on: boolean }
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'whiteboard'; x: number; y: number; w: number; h: number; text: string }
  | { kind: 'plant'; x: number; y: number }
  | { kind: 'ceilingTile'; x: number; y: number; w: number; h: number }
  | { kind: 'car'; x: number; y: number; w: number }
  | { kind: 'poster'; x: number; y: number; w: number; h: number; text: string }
  | { kind: 'clock'; x: number; y: number };

export type FigurePose = 'stand' | 'sit' | 'slump' | 'walk' | 'lean';

/* ------------------------------------------------------------------ scenes */

/**
 * A camera. `describe(tick)` returns the shapes to draw for that tick — this is
 * the deterministic stepper. `motion` scenes may move things between ticks;
 * `dead` cameras never draw anything but noise; `static` cameras always return
 * the same frame regardless of tick.
 */
export interface Scene {
  /** Stable, unique id. Renders burned into the frame as "CAM NN". */
  id: string;
  /** Location label, burned into the frame. Blocky CCTV register, all caps. */
  location: string;
  /** One dry line. Flat administrative register. Never winks, never exclaims. */
  caption: string;
  /** How the frame behaves over ticks. Governs whether motion is gated. */
  behaviour: 'static' | 'motion' | 'dead';
  /** Pure: same tick -> same shapes. No randomness. */
  describe(tick: number): Shape[];
}

/**
 * Deterministic pseudo-jitter. A cheap integer hash, NOT randomness: it is a
 * pure function of its inputs, so the same (seed, tick) is the same value every
 * run. Used to make figures shuffle a pixel or two without a clock or Math.random.
 */
function jitter(seed: number, tick: number, spread: number): number {
  let h = (seed * 374761393 + tick * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  // Map to roughly [-spread, +spread].
  return ((h % (spread * 2 + 1)) - spread);
}

/** A door/light state that flips on a slow, fixed cadence — no clock needed. */
function everyN(tick: number, n: number): boolean {
  return Math.floor(tick / n) % 2 === 0;
}

const FLOOR: Shape = { kind: 'floor', y: 78 };

export const SCENES: Scene[] = [
  {
    id: '01',
    location: 'CORRIDOR EAST',
    caption: 'Nothing has happened on camera 1.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'wall', x: 0, w: 14 },
      { kind: 'wall', x: 86, w: 14 },
      { kind: 'door', x: 40, y: 30, w: 18, h: 48, open: false },
      { kind: 'poster', x: 20, y: 34, w: 12, h: 16, text: 'FIRE\nEXIT' },
    ],
  },
  {
    id: '02',
    location: 'FLOOR — POD A',
    caption: 'A desk. The chair is at the desk. No one is at the chair.',
    behaviour: 'motion',
    describe: (tick) => [
      FLOOR,
      { kind: 'desk', x: 24, y: 52, w: 34 },
      { kind: 'monitor', x: 30, y: 40, on: everyN(tick, 6) },
      { kind: 'chair', x: 40, y: 60, pushedBack: everyN(tick, 9) },
      { kind: 'plant', x: 74, y: 54 },
    ],
  },
  {
    id: '03',
    location: 'KITCHENETTE',
    caption: 'The kettle has not been switched on. It remains available.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'desk', x: 30, y: 56, w: 40 },
      { kind: 'kettle', x: 44, y: 44 },
      { kind: 'poster', x: 66, y: 30, w: 16, h: 14, text: 'WASH\nUP' },
    ],
  },
  {
    id: '04',
    location: 'FLOOR — POD B',
    caption: 'One operator is present. He is asleep, or has the composure of a man who is.',
    behaviour: 'motion',
    describe: (tick) => [
      FLOOR,
      { kind: 'desk', x: 22, y: 52, w: 40 },
      { kind: 'monitor', x: 28, y: 40, on: true },
      {
        kind: 'figure',
        x: 44 + jitter(4, tick, 1),
        y: 46,
        pose: 'slump',
      },
      { kind: 'chair', x: 44, y: 62, pushedBack: false },
    ],
  },
  {
    id: '05',
    location: 'MANAGER OFFICE',
    caption: 'The whiteboard states the sales target. The target has not moved.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'desk', x: 30, y: 54, w: 36 },
      { kind: 'chair', x: 46, y: 60, pushedBack: true },
      {
        kind: 'whiteboard',
        x: 18,
        y: 18,
        w: 40,
        h: 26,
        text: 'TARGET\n£38,000',
      },
    ],
  },
  {
    id: '06',
    location: 'FIRE DOOR — REAR',
    caption: 'The fire door is propped open with a box. This has been the case since installation.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'wall', x: 0, w: 20 },
      { kind: 'door', x: 44, y: 24, w: 22, h: 54, open: true },
      { kind: 'box', x: 48, y: 62, w: 12, h: 12 },
    ],
  },
  {
    id: '07',
    location: 'CORRIDOR WEST',
    caption: 'A person walked through at an earlier time. They are no longer walking through.',
    behaviour: 'motion',
    describe: (tick) => {
      const walking = everyN(tick, 11);
      const shapes: Shape[] = [
        FLOOR,
        { kind: 'wall', x: 0, w: 12 },
        { kind: 'wall', x: 88, w: 12 },
        { kind: 'plant', x: 78, y: 52 },
      ];
      if (walking) {
        shapes.push({ kind: 'figure', x: 30 + jitter(7, tick, 3), y: 40, pose: 'walk' });
      }
      return shapes;
    },
  },
  {
    id: '08',
    location: 'RECEPTION',
    caption: 'The reception desk is staffed by a chair.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'desk', x: 26, y: 52, w: 44 },
      { kind: 'chair', x: 46, y: 60, pushedBack: false },
      { kind: 'clock', x: 50, y: 20 },
      { kind: 'plant', x: 12, y: 50 },
    ],
  },
  {
    id: '09',
    location: 'FLOOR — POD C',
    caption: 'Two operators confer. The subject of the conference is not recoverable from this angle.',
    behaviour: 'motion',
    describe: (tick) => [
      FLOOR,
      { kind: 'desk', x: 18, y: 54, w: 30 },
      { kind: 'desk', x: 56, y: 54, w: 30 },
      { kind: 'figure', x: 40 + jitter(9, tick, 2), y: 44, pose: 'stand' },
      { kind: 'figure', x: 52 + jitter(90, tick, 2), y: 44, pose: 'lean' },
    ],
  },
  {
    id: '10',
    location: 'STORE ROOM',
    caption: 'Boxes. The inventory of the boxes is not maintained on this system.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'box', x: 16, y: 46, w: 20, h: 28 },
      { kind: 'box', x: 40, y: 54, w: 16, h: 20 },
      { kind: 'box', x: 60, y: 40, w: 22, h: 34 },
      { kind: 'box', x: 30, y: 32, w: 18, h: 14 },
    ],
  },
  {
    id: '11',
    // The camera pointed at something useless.
    location: 'CEILING — POD A',
    caption: 'Camera 11 is directed at the ceiling. The ceiling is in good order.',
    behaviour: 'static',
    describe: () => [
      { kind: 'ceilingTile', x: 10, y: 10, w: 24, h: 24 },
      { kind: 'ceilingTile', x: 38, y: 10, w: 24, h: 24 },
      { kind: 'ceilingTile', x: 66, y: 10, w: 24, h: 24 },
      { kind: 'ceilingTile', x: 10, y: 38, w: 24, h: 24 },
      { kind: 'ceilingTile', x: 38, y: 38, w: 24, h: 24 },
      { kind: 'ceilingTile', x: 66, y: 38, w: 24, h: 24 },
    ],
  },
  {
    id: '12',
    // The camera pointed at a car park.
    location: 'CAR PARK',
    caption: 'The car park contains the same vehicles as yesterday. One is parked across two spaces.',
    behaviour: 'static',
    describe: () => [
      { kind: 'floor', y: 70 },
      { kind: 'car', x: 12, y: 50, w: 22 },
      { kind: 'car', x: 40, y: 50, w: 22 },
      { kind: 'car', x: 62, y: 52, w: 26 },
    ],
  },
  {
    id: '13',
    // The broken / black camera.
    location: 'FLOOR — POD D',
    caption: 'Camera 13 has been out of service since a date that predates the records.',
    behaviour: 'dead',
    describe: () => [],
  },
  {
    id: '14',
    location: 'STAIRWELL',
    caption: 'The stairwell is between floors, and remains so.',
    behaviour: 'static',
    describe: () => [
      FLOOR,
      { kind: 'wall', x: 0, w: 30 },
      { kind: 'box', x: 40, y: 40, w: 8, h: 8 },
      { kind: 'poster', x: 58, y: 30, w: 18, h: 18, text: 'NO\nSMOKING' },
    ],
  },
];

/* ------------------------------------------------------- timestamp formatter */

/**
 * Burned-in timestamp, in the flat 24h format 1990s hardware stamped into the
 * corner. Pure function of a tick: one tick = one second of camera time,
 * counted from a fixed, unremarkable epoch. Deterministic and testable.
 *
 * Format: "YYYY-MM-DD  HH:MM:SS". The date is deliberately mundane and fixed;
 * only the clock advances, and it wraps at 24h so the demo never shows an
 * implausible hour.
 */
export function formatTimestamp(tick: number): string {
  const t = ((tick % 86400) + 86400) % 86400; // seconds into the day, always >= 0
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `2003-11-04  ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Lookup a scene by id, or undefined. */
export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
