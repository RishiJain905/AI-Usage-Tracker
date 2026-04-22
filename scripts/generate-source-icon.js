#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
/**
 * AI Usage Tracker — Icon Generator v2
 * Produces a 512×512 PNG using a custom pixel shader (distance-field + gradient math).
 * Generates a cosmic neural-node icon with smooth gradients, anti-aliased shapes,
 * and additive glow effects — no external graphics libraries required.
 *
 * Usage: node scripts/generate-source-icon.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 512;
const MARGIN = 48;
const CORNER_RADIUS = 96;
const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");
const OUTPUT = path.join(RESOURCES_DIR, "icon.png");

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

function distanceToLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return length(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return length(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  return distanceToLine(px, py, x1, y1, x2, y2);
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function mixColours(c1, c2, t) {
  return {
    r: Math.round(lerp(c1.r, c2.r, t)),
    g: Math.round(lerp(c1.g, c2.g, t)),
    b: Math.round(lerp(c1.b, c2.b, t)),
  };
}

// ---------------------------------------------------------------------------
// Background radial gradient
// ---------------------------------------------------------------------------

const BG_STOPS = [
  { dist: 0.0, col: hexToRgb("#6366f1") },
  { dist: 0.35, col: hexToRgb("#4f46e5") },
  { dist: 0.65, col: hexToRgb("#312e81") },
  { dist: 1.0, col: hexToRgb("#0f172a") },
];

function sampleBackground(px, py) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const d = length(px - cx, py - cy) / (SIZE * 0.55);
  const t = clamp(d, 0, 1);
  for (let i = 0; i < BG_STOPS.length - 1; i++) {
    if (t >= BG_STOPS[i].dist && t <= BG_STOPS[i + 1].dist) {
      const local = (t - BG_STOPS[i].dist) / (BG_STOPS[i + 1].dist - BG_STOPS[i].dist);
      return mixColours(BG_STOPS[i].col, BG_STOPS[i + 1].col, local);
    }
  }
  return BG_STOPS[BG_STOPS.length - 1].col;
}

// ---------------------------------------------------------------------------
// Ambient glow (purple aura behind nodes)
// ---------------------------------------------------------------------------

function sampleAmbient(px, py) {
  const cx = SIZE / 2;
  const cy = SIZE / 2 - 10;
  const d = length(px - cx, py - cy) / 170;
  const falloff = Math.exp(-d * d * 2.5);
  const a = clamp(falloff * 0.45, 0, 1);
  return { r: 168, g: 85, b: 247, a };
}

// ---------------------------------------------------------------------------
// Glass top highlight
// ---------------------------------------------------------------------------

function sampleGlass(px, py) {
  if (py < MARGIN || py > MARGIN + CORNER_RADIUS * 2.5) return null;
  const t = (py - MARGIN) / (CORNER_RADIUS * 2.5);
  if (t > 1) return null;
  const a = Math.exp(-t * t * 8) * 0.18;
  return { r: 255, g: 255, b: 255, a: clamp(a, 0, 0.35) };
}

// ---------------------------------------------------------------------------
// Rounded-rect signed-distance field (for clip + edge AA)
// ---------------------------------------------------------------------------

function sdRoundedRect(px, py, x, y, w, h, r) {
  const cx = px - x - w / 2;
  const cy = py - y - h / 2;
  const qx = Math.abs(cx) - w / 2 + r;
  const qy = Math.abs(cy) - h / 2 + r;
  const dOut = length(Math.max(qx, 0), Math.max(qy, 0));
  const dIn = Math.min(Math.max(qx, 0), Math.max(qy, 0));
  return dOut + dIn - r;
}

// ---------------------------------------------------------------------------
// Icon geometry (centred at 0,0; will be translated to centre)
// ---------------------------------------------------------------------------

const CX = SIZE / 2;
const CY = SIZE / 2;

const HEX = [
  { x: 0, y: -88 },
  { x: 76.2, y: -44 },
  { x: 76.2, y: 44 },
  { x: 0, y: 88 },
  { x: -76.2, y: 44 },
  { x: -76.2, y: -44 },
];

const TRI = [
  { x: 0, y: -44 },
  { x: 38.1, y: 22 },
  { x: -38.1, y: 22 },
];

const ACCENT = { cx: 376, cy: 376, r: 8 };

// ---------------------------------------------------------------------------
// Pixel shader
// ---------------------------------------------------------------------------

function shadePixel(px, py) {
  // Background
  const bg = sampleBackground(px, py);
  let r = bg.r;
  let g = bg.g;
  let b = bg.b;

  // Ambient purple glow
  const amb = sampleAmbient(px, py);
  if (amb) {
    r = lerp(r, amb.r, amb.a);
    g = lerp(g, amb.g, amb.a);
    b = lerp(b, amb.b, amb.a);
  }

  // Clip to rounded rect
  const outerMargin = MARGIN;
  const innerSize = SIZE - outerMargin * 2;
  const dRect = sdRoundedRect(px, py, outerMargin, outerMargin, innerSize, innerSize, CORNER_RADIUS);
  const alphaRect = 1.0 - smoothstep(-0.5, 1.5, dRect);
  if (alphaRect <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  // Inner shadow (subtle depth)
  if (dRect < 6 && dRect > -2) {
    const shadow = smoothstep(6, -2, dRect) * 0.12;
    r *= 1 - shadow;
    g *= 1 - shadow;
    b *= 1 - shadow;
  }

  // Glass highlight
  const glass = sampleGlass(px, py);
  if (glass) {
    r = lerp(r, glass.r, glass.a);
    g = lerp(g, glass.g, glass.a);
    b = lerp(b, glass.b, glass.a);
  }

  // Local coords centred on icon
  const u = px - CX;
  const v_ = py - CY;

  // Hexagon ring SDF
  let dHex = Infinity;
  for (let i = 0; i < HEX.length; i++) {
    const a = HEX[i];
    const b_ = HEX[(i + 1) % HEX.length];
    const dSeg = distanceToSegment(u, v_, a.x, a.y, b_.x, b_.y);
    if (dSeg < dHex) dHex = dSeg;
  }
  const hexStroke = smoothstep(7.5, 2.5, Math.abs(dHex)) * 0.85;
  if (hexStroke > 0) {
    r = lerp(r, 255, hexStroke);
    g = lerp(g, 255, hexStroke);
    b = lerp(b, 255, hexStroke);
  }

  // Inner triangle lines
  for (let i = 0; i < TRI.length; i++) {
    const a = TRI[i];
    const b_ = TRI[(i + 1) % TRI.length];
    const dLine = distanceToSegment(u, v_, a.x, a.y, b_.x, b_.y);
    const lineStroke = smoothstep(6, 2, dLine) * 0.7;
    if (lineStroke > 0) {
      r = lerp(r, 255, lineStroke);
      g = lerp(g, 255, lineStroke);
      b = lerp(b, 255, lineStroke);
    }
  }

  // Nodes with additive glow
  const NODES = [
    { x: 0, y: -44, r: 16 },
    { x: 38.1, y: 22, r: 16 },
    { x: -38.1, y: 22, r: 16 },
  ];

  for (const node of NODES) {
    const dNode = length(u - node.x, v_ - node.y);
    const core = smoothstep(node.r + 1, node.r - 2, dNode);
    if (core > 0) {
      r = lerp(r, 255, core);
      g = lerp(g, 255, core);
      b = lerp(b, 255, core);
    }
    const haloR = node.r + 10;
    const halo = smoothstep(haloR, haloR - 6, dNode) * 0.35;
    if (halo > 0) {
      r = lerp(r, 255, halo);
      g = lerp(g, 255, halo);
      b = lerp(b, 255, halo);
    }
  }

  // Central hub
  const dCenter = length(u, v_);
  const centerDot = smoothstep(9, 3, dCenter) * 0.9;
  if (centerDot > 0) {
    r = lerp(r, 255, centerDot);
    g = lerp(g, 255, centerDot);
    b = lerp(b, 255, centerDot);
  }

  // Bottom accent line + dot
  const dAccentLine = distanceToSegment(u, v_, 0, 88, 0, 110);
  const accentLine = smoothstep(6, 1.5, dAccentLine) * 0.6;
  if (accentLine > 0) {
    r = lerp(r, 168, accentLine);
    g = lerp(g, 85, accentLine);
    b = lerp(b, 247, accentLine);
  }
  const dAccentDot = length(u, v_ - 116);
  const accentDot = smoothstep(7, 2, dAccentDot) * 0.8;
  if (accentDot > 0) {
    r = lerp(r, 168, accentDot);
    g = lerp(g, 85, accentDot);
    b = lerp(b, 247, accentDot);
  }

  // Corner accent dot
  const dCornerDot = length(px - ACCENT.cx, py - ACCENT.cy);
  const cornerDot = smoothstep(ACCENT.r + 2, ACCENT.r - 2, dCornerDot) * 0.9;
  if (cornerDot > 0) {
    r = lerp(r, 168, cornerDot);
    g = lerp(g, 85, cornerDot);
    b = lerp(b, 247, cornerDot);
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: Math.round(alphaRect * 255) };
}

// ---------------------------------------------------------------------------
// PNG encoder (no external deps)
// ---------------------------------------------------------------------------

function createPNG(width, height, pixelFn) {
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 4;
      const col = pixelFn(x, y);
      pixels[off] = col.r;
      pixels[off + 1] = col.g;
      pixels[off + 2] = col.b;
      pixels[off + 3] = col.a;
    }
  }

  return encodePNG(pixels, width, height);
}

function encodePNG(pixels, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk("IHDR", ihdrData);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk("IDAT", compressed);

  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crcBuf]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

console.log("Rendering 512×512 icon with distance-field shader...");
const png = createPNG(SIZE, SIZE, shadePixel);
fs.writeFileSync(OUTPUT, png);
console.log(`Created: ${OUTPUT} (${png.length.toLocaleString()} bytes)`);
console.log("Done! Run 'npm run generate-icons' to regenerate .ico and .icns.");
