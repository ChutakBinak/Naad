/**
 * Generates Naad extension icons (16, 48, 128 px) using only Node.js built-ins.
 * Run: node scripts/generate-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
function buildCRCTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = buildCRCTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG chunk ──────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Build PNG from RGBA pixels ─────────────────────────────────────────────
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA color type
  // bytes 10–12: compression=0, filter=0, interlace=0

  // Filter type 0 (None) + RGBA per pixel, per row
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rows.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  const idat = zlib.deflateSync(Buffer.from(rows));

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Draw icon ──────────────────────────────────────────────────────────────
function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);

  const BG = [15, 15, 15, 255];
  const ACC = [200, 255, 0, 255]; // neon lime
  const REC = [255, 68, 68, 255]; // red dot

  // Accent "n" letter bounds (rough mono approximation)
  const letterLeft  = Math.floor(size * 0.18);
  const letterRight = Math.floor(size * 0.82);
  const letterTop   = Math.floor(size * 0.22);
  const letterBot   = Math.floor(size * 0.78);
  const lw = Math.max(1, Math.round(size * 0.14)); // stroke width

  function setPixel(x, y, color) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i]     = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = color[3];
  }

  function fillRect(x1, y1, x2, y2, color) {
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        setPixel(x, y, color);
  }

  function fillCircle(cx, cy, r, color) {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPixel(x, y, color);
  }

  // Dark rounded background (approximate — fill full, corners trimmed)
  fillRect(0, 0, size - 1, size - 1, BG);

  // Rounded corners: clear pixels outside radius
  const r = Math.max(2, Math.floor(size * 0.22));
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < r; x++) {
      const dx = r - x - 1, dy = r - y - 1;
      if (dx * dx + dy * dy > r * r) {
        [
          [x, y], [size - 1 - x, y],
          [x, size - 1 - y], [size - 1 - x, size - 1 - y],
        ].forEach(([px, py]) => {
          const i = (py * size + px) * 4;
          rgba[i + 3] = 0; // transparent
        });
      }
    }
  }

  // Draw "n" — left vertical stroke
  fillRect(letterLeft, letterTop, letterLeft + lw - 1, letterBot, ACC);

  // Arch top
  const archH = Math.floor((letterBot - letterTop) * 0.45);
  fillRect(letterLeft, letterTop, letterRight - lw, letterTop + lw - 1, ACC);

  // Diagonal
  const steps = archH;
  for (let s = 0; s < steps; s++) {
    const x = letterLeft + Math.round(((letterRight - lw - letterLeft) / steps) * s);
    const y = letterTop + s;
    fillRect(x, y, x + lw - 1, y + lw - 1, ACC);
  }

  // Right vertical stroke
  fillRect(letterRight - lw, letterTop + archH, letterRight - 1, letterBot, ACC);

  // Small recording-dot (red, top-right)
  if (size >= 48) {
    const dotR = Math.max(2, Math.floor(size * 0.1));
    fillCircle(size - dotR - Math.floor(size * 0.06), dotR + Math.floor(size * 0.06), dotR, REC);
  }

  return rgba;
}

// ── Main ───────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const rgba = drawIcon(size);
  const png  = encodePNG(size, size, rgba);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ icon${size}.png`);
}

console.log('\nIcons written to extension/public/icons/');
