# LaserView

LaserView is a small web app for previewing G-code toolpaths before sending jobs to a machine.

## Live app

[Open LaserView](https://idoroseman.github.io/laserview/)

## Why this utility exists

The utility in `gcodeParser.js` exists to turn raw G-code text into drawing-friendly data.

You wrote it to solve a practical workflow problem:

- Raw G-code is hard to reason about quickly by reading text.
- You need to visually verify drawn moves vs travel moves before running a job.
- You want to see pauses (`G04`) and arcs (`G02`/`G03`) in the same preview.
- You want a parser that is lightweight and easy to run in-browser without extra tooling.

In short, this utility is the translation layer between machine instructions and a human-checkable preview.

## What the parser returns

`parseGcode(text)` returns:

- `paths`: an array of path objects.
- `dwellPoints`: points where `G04`/`G4` dwell commands occur.

Each path has:

- `drawn`: `true` when laser is on (`M106`), `false` when laser is off (`M107`).
- `points`: ordered `{ x, y }` coordinates ready for rendering.

## How it is used in this app

In `src/App.vue`, uploaded file text is passed to the parser:

```js
const parsed = parseGcode(text);
toolpath.value = parsed.paths;
dwellPoints.value = parsed.dwellPoints;
```

Then the canvas renderer:

- draws `drawn` paths as solid lines,
- draws travel/head moves as dashed lines,
- marks dwell points as dots,
- allows filtering head moves with the "Show head moves" toggle.

## Supported command handling

Current parser behavior includes:

- `G0` / `G00` and `G1` / `G01` linear moves
- `G2` / `G02` and `G3` / `G03` arcs
  - prefers `I`/`J` center offsets
  - supports `R` radius fallback
  - approximates arcs into line segments for canvas rendering
- `G4` / `G04` dwell point collection
- `M106` / `M107` draw-state switching
- comment stripping with `;`

## Using the utility directly

You can use the parser outside the Vue UI as a plain module.

Example:

```js
import { parseGcode } from './src/gcodeParser.js';

const gcode = `
G00 X0 Y0
M106
G01 X10 Y0
G02 X10 Y10 I0 J5
M107
G04 P0.5
`;

const result = parseGcode(gcode);
console.log(result.paths);
console.log(result.dwellPoints);
```

You can also run the included test file:

```sh
node test-gcode.mjs
```

## Project setup

```sh
npm install
```

### Development

```sh
npm run dev
```

### Production build

```sh
npm run build
```

### Deploy

```sh
npm run deploy
```
