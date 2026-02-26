'use strict';
/**
 * gen_pwa_icons.cjs
 * Pure Node.js (no external deps) PNG generator for CardBattler PWA icons.
 * Outputs public/icon-192.png and public/icon-512.png.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Minimal PNG encoder ────────────────────────────────────────────────────
function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1);
    t[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(w, h, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB, no alpha

  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixelFn(x, y);
      row[1 + x * 3 + 0] = r;
      row[1 + x * 3 + 1] = g;
      row[1 + x * 3 + 2] = b;
    }
    rows.push(row);
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── SDF for rounded rectangle (negative = inside) ────────────────────────
function sdfRoundedRect(px, py, x1, y1, x2, y2, r) {
  const cx = (x1 + x2) * 0.5;
  const cy = (y1 + y2) * 0.5;
  const qx = Math.abs(px - cx) - (x2 - x1) * 0.5 + r;
  const qy = Math.abs(py - cy) - (y2 - y1) * 0.5 + r;
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2)
       + Math.min(Math.max(qx, qy), 0)
       - r;
}

// ── Icon pixel function (designed at 192×192, scaled up) ─────────────────
//
//  Visual design (cyberpunk card theme):
//  ┌──────────────────────────────┐   ← cyan border
//  │  ·               ·          │   ← tiny cyan pips (suit marks)
//  │       ┌────────────┐        │
//  │       │   ◆◆◆◆     │        │   ← yellow diamond cluster
//  │       │   ◆◆◆◆     │        │
//  │       │   ◆◆◆◆     │        │
//  │       └────────────┘        │   ← purple inner border
//  │  ·               ·          │
//  └──────────────────────────────┘

function drawPixel(x, y, w, h) {
  const s = w / 192;

  // Palette
  const BG     = [13,  13,  24 ];   // #0d0d18  — deep navy
  const BGFILL = [18,  18,  32 ];   // #121220  — card interior
  const CYAN   = [0,   240, 255];   // #00f0ff  — primary neon
  const YELLOW = [255, 230, 0  ];   // #ffe600  — gold/accent
  const PURPLE = [140, 60,  220];   // #8c3cdc  — inner accent
  const CPURP  = [80,  30,  140];   // darker purple for pip fill

  // ── Outer card border ────────────────────────────────────────────────────
  const margin  = 16 * s;
  const x1 = margin,      y1 = margin * 1.15;
  const x2 = w - margin,  y2 = h - margin * 1.15;
  const outerR = 18 * s;
  const borderW = 6.5 * s;

  const outerSdf = sdfRoundedRect(x, y, x1, y1, x2, y2, outerR);

  // Outer border ring (cyan)
  if (outerSdf >= -borderW && outerSdf <= 0.8 * s) return CYAN;

  // Outside the card entirely
  if (outerSdf > 0.8 * s) return BG;

  // ─── We are inside the card ──────────────────────────────────────────────

  // Inner accent border (purple, inset by ~28px)
  const innerM = 26 * s;
  const innerR = outerR * 0.55;
  const innerSdf = sdfRoundedRect(x, y, x1 + innerM, y1 + innerM, x2 - innerM, y2 - innerM, innerR);
  if (innerSdf >= -2.5 * s && innerSdf <= 0.5 * s) return PURPLE;

  // ── Corner pips (4 small circles at card corners) ────────────────────────
  const pipRadius = 6 * s;
  const pipOffset = 34 * s;
  const pips = [
    [x1 + pipOffset, y1 + pipOffset],
    [x2 - pipOffset, y1 + pipOffset],
    [x1 + pipOffset, y2 - pipOffset],
    [x2 - pipOffset, y2 - pipOffset],
  ];
  for (const [px, py] of pips) {
    const d = Math.hypot(x - px, y - py);
    if (d < pipRadius)             return CYAN;
    if (d < pipRadius + 1.5 * s)  return [0, 120, 160]; // soft glow ring
  }

  // ── Central diamond cluster ───────────────────────────────────────────────
  // Render a 3×4 grid of small diamonds, centred on the card
  const dcx = w * 0.5, dcy = h * 0.5;
  const dw = 18 * s;           // diamond half-width
  const dh = 22 * s;           // diamond half-height
  const gapX = 42 * s;         // column spacing
  const gapY = 38 * s;         // row spacing
  const cols = [-gapX * 0.5, gapX * 0.5];
  const rows = [-gapY, 0, gapY];

  for (const col of cols) {
    for (const row of rows) {
      const cx = dcx + col, cy = dcy + row;
      const dx = Math.abs(x - cx) / dw;
      const dy = Math.abs(y - cy) / dh;
      const dist = dx + dy;
      if (dist <= 0.88) return YELLOW;                  // diamond fill
      if (dist <= 1.05) return [200, 160, 0];           // soft edge
    }
  }

  // ── Centre glow dot (small bright circle) ────────────────────────────────
  const centreD = Math.hypot(x - w * 0.5, y - h * 0.5);
  if (centreD < 5 * s) return [255, 255, 180];

  // Inner purple-fill zone
  if (innerSdf < 0) return CPURP;

  return BGFILL;
}

// ── Generate & save icons ──────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const buf = makePNG(size, size, (x, y) => drawPixel(x, y, size, size));
  const out = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(out, buf);
  process.stdout.write(`✓ icon-${size}.png  (${(buf.length / 1024).toFixed(1)} kB)\n`);
}
process.stdout.write('Icons written to public/\n');
