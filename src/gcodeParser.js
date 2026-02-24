export function parseGcode(text) {
  const lines = text.split(/\r?\n/);

  let x = 0;
  let y = 0;

  const paths = [];
  let currentPath = null;
  let currentDrawn = false; // controlled by M106 (true) / M107 (false)

  for (const rawLine of lines) {
    const line = rawLine.split(';')[0].trim();
    if (!line) continue;

    if (/^M106\b/i.test(line)) {
      currentDrawn = true;
      currentPath = null; // next move starts a new drawn path
      continue;
    }

    if (/^M107\b/i.test(line)) {
      currentDrawn = false;
      currentPath = null; // next move starts a new undrawn path
      continue;
    }
    // G00 / G0 and G01 / G1 - linear moves
    if (/^G0?0?1?\b/i.test(line) && /\bG0?1?\b/i.test(line)) {
      const xMatch = line.match(/\bX(-?\d+(?:\.\d+)?)/i);
      const yMatch = line.match(/\bY(-?\d+(?:\.\d+)?)/i);

      if (xMatch) x = parseFloat(xMatch[1]);
      if (yMatch) y = parseFloat(yMatch[1]);

      if (!currentPath) {
        currentPath = { drawn: currentDrawn, points: [] };
        paths.push(currentPath);
      }

      currentPath.points.push({ x, y });
      continue;
    }

    // G00 rapid move (alias G0) - treat same as linear move here
    if (/^G0\b/i.test(line)) {
      const xMatch = line.match(/\bX(-?\d+(?:\.\d+)?)/i);
      const yMatch = line.match(/\bY(-?\d+(?:\.\d+)?)/i);

      if (xMatch) x = parseFloat(xMatch[1]);
      if (yMatch) y = parseFloat(yMatch[1]);

      if (!currentPath) {
        currentPath = { drawn: currentDrawn, points: [] };
        paths.push(currentPath);
      }

      currentPath.points.push({ x, y });
      continue;
    }

    // G04 dwell - no motion, ignore
    if (/^G04\b/i.test(line)) {
      continue;
    }

    // G02 / G03 - clockwise / counterclockwise arcs
    if (/^G0?2\b/i.test(line) || /^G0?3\b/i.test(line)) {
      const isCW = /^G0?2\b/i.test(line); // G2 = CW, G3 = CCW
      const xMatch = line.match(/\bX(-?\d+(?:\.\d+)?)/i);
      const yMatch = line.match(/\bY(-?\d+(?:\.\d+)?)/i);
      const iMatch = line.match(/\bI(-?\d+(?:\.\d+)?)/i);
      const jMatch = line.match(/\bJ(-?\d+(?:\.\d+)?)/i);
      const rMatch = line.match(/\bR(-?\d+(?:\.\d+)?)/i);

      const x1 = xMatch ? parseFloat(xMatch[1]) : x;
      const y1 = yMatch ? parseFloat(yMatch[1]) : y;

      // Prefer I/J center offsets
      if (iMatch && jMatch) {
        const cx = x + parseFloat(iMatch[1]);
        const cy = y + parseFloat(jMatch[1]);

        const startAngle = Math.atan2(y - cy, x - cx);
        let endAngle = Math.atan2(y1 - cy, x1 - cx);

        // Compute delta angle according to direction
        let delta = endAngle - startAngle;
        if (isCW) {
          if (delta >= 0) delta -= Math.PI * 2;
        } else {
          if (delta <= 0) delta += Math.PI * 2;
        }

        const radius = Math.hypot(x - cx, y - cy);
        const arcLen = Math.abs(delta) * radius;
        const segments = Math.max(6, Math.ceil(arcLen / 1)); // ~1 unit per segment, min 6

        if (!currentPath) {
          currentPath = { drawn: currentDrawn, points: [] };
          paths.push(currentPath);
        }

        for (let s = 1; s <= segments; s++) {
          const t = s / segments;
          const angle = startAngle + delta * t;
          const px = cx + radius * Math.cos(angle);
          const py = cy + radius * Math.sin(angle);
          currentPath.points.push({ x: +px, y: +py });
        }

        x = x1;
        y = y1;
        continue;
      }

      // Fallback: R (radius) parameter handling (approximate)
      if (rMatch) {
        const r = Math.abs(parseFloat(rMatch[1]));
        // Compute arc center from chord midpoint geometry
        const dx = x1 - x;
        const dy = y1 - y;
        const chordLen = Math.hypot(dx, dy);
        if (chordLen === 0 || r < chordLen / 2) {
          // Invalid arc, treat as linear
          if (!currentPath) {
            currentPath = { drawn: currentDrawn, points: [] };
            paths.push(currentPath);
          }
          currentPath.points.push({ x: x1, y: y1 });
          x = x1; y = y1;
          continue;
        }

        const mx = (x + x1) / 2;
        const my = (y + y1) / 2;
        const h = Math.sqrt(Math.max(0, r * r - (chordLen / 2) * (chordLen / 2)));
        // perpendicular unit vector
        const ux = -dy / chordLen;
        const uy = dx / chordLen;

        // two possible centers; choose one based on CW/CCW
        const c1x = mx + ux * h;
        const c1y = my + uy * h;
        const c2x = mx - ux * h;
        const c2y = my - uy * h;

        // pick center that gives correct direction
        const start1 = Math.atan2(y - c1y, x - c1x);
        const end1 = Math.atan2(y1 - c1y, x1 - c1x);
        let delta1 = end1 - start1;
        if (isCW) { if (delta1 >= 0) delta1 -= Math.PI * 2; } else { if (delta1 <= 0) delta1 += Math.PI * 2; }

        const start2 = Math.atan2(y - c2y, x - c2x);
        const end2 = Math.atan2(y1 - c2y, x1 - c2x);
        let delta2 = end2 - start2;
        if (isCW) { if (delta2 >= 0) delta2 -= Math.PI * 2; } else { if (delta2 <= 0) delta2 += Math.PI * 2; }

        let cx = c1x, cy = c1y, delta = delta1;
        if (Math.abs(delta2) < Math.abs(delta1)) { cx = c2x; cy = c2y; delta = delta2; }

        const radiusUsed = Math.hypot(x - cx, y - cy);
        const arcLen2 = Math.abs(delta) * radiusUsed;
        const segments2 = Math.max(6, Math.ceil(arcLen2 / 1));

        if (!currentPath) {
          currentPath = { drawn: currentDrawn, points: [] };
          paths.push(currentPath);
        }

        for (let s = 1; s <= segments2; s++) {
          const t = s / segments2;
          const angle = start1 + ( (Math.abs(delta2) < Math.abs(delta1) ? delta2 : delta1) ) * t;
          const px = cx + radiusUsed * Math.cos(angle);
          const py = cy + radiusUsed * Math.sin(angle);
          currentPath.points.push({ x: +px, y: +py });
        }

        x = x1;
        y = y1;
        continue;
      }

      // If we get here, no I/J/R provided — fallback to linear
      if (!currentPath) {
        currentPath = { drawn: currentDrawn, points: [] };
        paths.push(currentPath);
      }
      currentPath.points.push({ x: x1, y: y1 });
      x = x1; y = y1;
      continue;
    }
  }

  return paths;
}

