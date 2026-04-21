#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
/**
 * Creates a placeholder icon.png for development builds.
 * Replace with a proper 512x512 icon before release.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 512;
const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");
const OUTPUT = path.join(RESOURCES_DIR, "icon.png");

function createPNG(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      const margin = width * 0.094;
      const innerSize = width - margin * 2;
      const radius = width * 0.156;
      const ix = x - margin;
      const iy = y - margin;

      let inRect = false;
      if (ix >= 0 && ix <= innerSize && iy >= 0 && iy <= innerSize) {
        const cornerX =
          ix < radius
            ? radius
            : ix > innerSize - radius
              ? innerSize - radius
              : ix;
        const cornerY =
          iy < radius
            ? radius
            : iy > innerSize - radius
              ? innerSize - radius
              : iy;
        const cornerDist = Math.sqrt(
          (ix - cornerX) ** 2 + (iy - cornerY) ** 2,
        );
        inRect = cornerDist <= radius;
      }

      if (inRect) {
        const t = (iy + radius * 0.3) / (innerSize + radius * 0.6);
        const r = Math.round(99 + (124 - 99) * Math.min(t, 1));
        const g = Math.round(102 + (58 - 102) * Math.min(t, 1));
        const b = Math.round(241 + (237 - 241) * Math.min(t, 1));

        const barWidth = innerSize * 0.11;
        const barGap = innerSize * 0.04;
        const totalBarsWidth = barWidth * 3 + barGap * 2;
        const barsStartX = (innerSize - totalBarsWidth) / 2;
        const barHeights = [0.24, 0.39, 0.31];
        const barBottom = innerSize * 0.78;
        const barMaxHeight = innerSize * 0.32;

        let inBar = false;
        for (let i = 0; i < 3; i++) {
          const bx = barsStartX + i * (barWidth + barGap);
          const bh = barMaxHeight * barHeights[i];
          const by = barBottom - bh;
          if (
            ix >= bx &&
            ix <= bx + barWidth &&
            iy >= by &&
            iy <= barBottom
          ) {
            inBar = true;
            break;
          }
        }

        if (inBar) {
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
          pixels[offset + 3] = 240;
        } else {
          pixels[offset] = r;
          pixels[offset + 1] = g;
          pixels[offset + 2] = b;
          pixels[offset + 3] = 255;
        }
      } else {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 0;
      }
    }
  }

  return encodePNG(pixels, width, height);
}

function encodePNG(
  pixels: Buffer,
  width: number,
  height: number,
): Buffer {
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
    pixels.copy(
      rawData,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk("IDAT", compressed);

  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}

const png = createPNG(SIZE, SIZE);
fs.writeFileSync(OUTPUT, png);
console.log(`Created placeholder icon: ${OUTPUT} (${png.length} bytes)`);
console.log("Replace with a proper 512x512 icon before release.");
