import { parseGcode } from './src/gcodeParser.js';

const g = `
G00 X0 Y0
M106
G01 X10 Y0
G02 X10 Y10 I0 J5
G03 X0 Y10 I-5 J0
M107
G04 P0.5
`;

console.log(JSON.stringify(parseGcode(g), null, 2));
