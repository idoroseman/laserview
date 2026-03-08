<script setup>
import { onMounted, ref, watch } from 'vue';
import { parseGcode } from './gcodeParser';

const mousePosPx = ref(null); // {x, y} in canvas px
const mousePosGcode = ref(null); // {x, y} in gcode units
const mousePosMm = ref(null); // {x, y} in mm
const showCoords = ref(false);

const showGrid = ref(false);
const showHeadMoves = ref(true);

const canvasRef = ref(null);
const containerRef = ref(null);
const gcodeText = ref('');
const status = ref('Drop a .gcode file here or use the button.');
const isDragging = ref(false);

const toolpath = ref([]);
const dwellPoints = ref([]);

function onDragOver(event) {
  event.preventDefault();
  isDragging.value = true;
}

function onDragLeave(event) {
  event.preventDefault();
  isDragging.value = false;
}

function onDrop(event) {
  event.preventDefault();
  isDragging.value = false;

  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  handleFile(file);
}

function onFileChange(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  handleFile(file);
}

function handleFile(file) {
  status.value = `Loading "${file.name}"...`;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    gcodeText.value = text;
    const parsed = parseGcode(text);
    const paths = parsed.paths;
    const dwells = parsed.dwellPoints;

    if (!paths.length && !dwells.length) {
      status.value = 'No paths or G04 dwell points found in file.';
      toolpath.value = [];
      dwellPoints.value = [];
    } else {
      toolpath.value = paths;
      dwellPoints.value = dwells;
      const moveCount = paths.reduce((sum, path) => sum + path.points.length, 0);
      status.value = `Loaded ${paths.length} paths, ${moveCount} moves, ${dwells.length} dwells.`;
    }

    redraw();
  };
  reader.onerror = () => {
    status.value = 'Failed to read file.';
  };
  reader.readAsText(file);
}

function getBounds(paths, points = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const path of paths) {
    for (const p of path.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function resizeCanvasToContainer() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
}

function getVisiblePaths() {
  if (showHeadMoves.value) return toolpath.value;
  return toolpath.value.filter((path) => path.drawn);
}

function redraw() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const visiblePaths = getVisiblePaths();

  if (!visiblePaths.length && !dwellPoints.value.length) {
    redraw._bounds = null;
    return;
  }

  const bounds = getBounds(visiblePaths, dwellPoints.value);
  if (!bounds) {
    redraw._bounds = null;
    return;
  }

  const padding = 20;
  const w = canvas.width;
  const h = canvas.height;

  const pathWidth = bounds.maxX - bounds.minX || 1;
  const pathHeight = bounds.maxY - bounds.minY || 1;

  const scaleX = (w - 2 * padding) / pathWidth;
  const scaleY = (h - 2 * padding) / pathHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (w - pathWidth * scale) / 2;
  const offsetY = (h - pathHeight * scale) / 2;

  // Store for mouse conversion
  redraw._bounds = bounds;
  redraw._scale = scale;
  redraw._offsetX = offsetX;
  redraw._offsetY = offsetY;

  ctx.save();

  // Draw grid lines if enabled
  if (showGrid.value) {
    ctx.save();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    // Draw grid every 10mm (1cm)
    const gridSpacing = 10; // mm
    for (let gx = Math.ceil(bounds.minX / gridSpacing) * gridSpacing; gx <= bounds.maxX; gx += gridSpacing) {
      const x = offsetX + (gx - bounds.minX) * scale;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + pathHeight * scale);
      ctx.stroke();
    }
    for (let gy = Math.ceil(bounds.minY / gridSpacing) * gridSpacing; gy <= bounds.maxY; gy += gridSpacing) {
      const y = offsetY + (bounds.maxY - gy) * scale;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + pathWidth * scale, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  const allPoints = [];

  visiblePaths.forEach((path) => {
    if (!path.points.length) return;

    ctx.beginPath();
    ctx.lineWidth = 2;
    if (path.drawn) {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#1976d2';
    } else {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#999999';
    }

    path.points.forEach((p, index) => {
      const x = offsetX + (p.x - bounds.minX) * scale;
      const y = offsetY + (bounds.maxY - p.y) * scale; // invert Y for canvas

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      allPoints.push({ x, y });
    });

    ctx.stroke();
  });

  ctx.setLineDash([]);

  if (allPoints.length) {
    const first = allPoints[0];
    const last = allPoints[allPoints.length - 1];

    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(first.x, first.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (dwellPoints.value.length) {
    ctx.fillStyle = '#1565c0';
    for (const p of dwellPoints.value) {
      const x = offsetX + (p.x - bounds.minX) * scale;
      const y = offsetY + (bounds.maxY - p.y) * scale;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

onMounted(() => {
  resizeCanvasToContainer();
  redraw();
  window.addEventListener('resize', handleResize);

  const canvas = canvasRef.value;
  if (canvas) {
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
  }
});

function handleResize() {
  resizeCanvasToContainer();
  redraw();
}

function handleMouseMove(e) {
  const canvas = canvasRef.value;
  const visiblePaths = getVisiblePaths();
  if (!canvas || (!visiblePaths.length && !dwellPoints.value.length)) {
    showCoords.value = false;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Mouse px relative to canvas
  const px = (e.clientX - rect.left) * dpr;
  const py = (e.clientY - rect.top) * dpr;
  mousePosPx.value = { x: px, y: py };

  // Convert to G-code units
  const bounds = redraw._bounds;
  const scale = redraw._scale;
  const offsetX = redraw._offsetX;
  const offsetY = redraw._offsetY;
  if (!bounds || !scale) {
    showCoords.value = false;
    return;
  }
  // Invert Y for canvas
  const gx = (px - offsetX) / scale + bounds.minX;
  const gy = bounds.maxY - (py - offsetY) / scale;
  mousePosGcode.value = { x: gx, y: gy };
  // Assume G-code units are mm and show mm directly.
  mousePosMm.value = { x: gx, y: gy };
  showCoords.value = true;
}

function handleMouseLeave() {
  showCoords.value = false;
}

watch(toolpath, () => {
  resizeCanvasToContainer();
  redraw();
});

watch(dwellPoints, () => {
  resizeCanvasToContainer();
  redraw();
});

watch(showGrid, () => {
  redraw();
});

watch(showHeadMoves, () => {
  redraw();
});
</script>

<template>
  <div class="app-layout">
    <aside class="col col-left">
      <h2>Controls</h2>
      <p class="status">{{ status }}</p>
      <label class="file-button">
        Open G-code file
        <input type="file" accept=".gcode,.nc,.txt" @change="onFileChange" />
      </label>
    </aside>

    <main class="col col-center">
          <header class="center-header">
            <h1>G-code viewer</h1>
            <div class="header-toggles">
              <label class="toggle-grid">
                <input type="checkbox" v-model="showGrid" />
                <span>Show grid</span>
              </label>
              <label class="toggle-grid">
                <input type="checkbox" v-model="showHeadMoves" />
                <span>Show head moves</span>
              </label>
            </div>
          </header>


      <div
        ref="containerRef"
        class="canvas-wrapper"
        @dragover="onDragOver"
        @dragenter.prevent
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <canvas ref="canvasRef"></canvas>
        <div v-if="!toolpath.length && !dwellPoints.length" class="canvas-placeholder">
          Drop a G-code file here or use the "Open G-code file" button.
        </div>
        <div v-if="isDragging" class="drag-overlay">
          Drop file to load
        </div>
            <div v-if="showCoords && mousePosMm" class="coords-bar">
              X: {{ mousePosMm.x.toFixed(2) }} mm,
              Y: {{ mousePosMm.y.toFixed(2) }} mm
            </div>
      </div>
    </main>

    <aside class="col col-right">
      <h2>Right column</h2>
      <p>Use this for extra info, ads, or tools.</p>
    </aside>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr; /* left / center / right */
  gap: 1rem;
  min-height: 100vh;
  padding: 1rem;
  box-sizing: border-box;
  background: #f0f2f5;
}

.col {
  background: #ffffff;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.col-left {
  background: #f5f7ff;
}

.col-right {
  background: #fff7e6;
}

.col-center {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.center-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.center-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.status {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #555;
}

.file-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: #1976d2;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}

.file-button input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.canvas-wrapper {
  position: relative;
  flex: 1;
  min-height: 300px;
  border-radius: 8px;
  background: #fafafa;
  border: 1px dashed #ccc;
  overflow: hidden;
}

.coords-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  color: #fff;
  font-size: 1rem;
  padding: 6px 12px;
  text-align: center;
  pointer-events: none;
  z-index: 10;
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.canvas-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
  color: #777;
  pointer-events: none;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(25, 118, 210, 0.08);
  border: 2px dashed #1976d2;
  color: #1976d2;
  font-weight: 500;
  pointer-events: none;
}

</style>

<style scoped>
.header-toggles {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.toggle-grid {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
}
@media (max-width: 768px) {
  .app-layout {
    grid-template-columns: 1fr;
  }

  .header-toggles {
    justify-content: flex-start;
  }
}
</style>
