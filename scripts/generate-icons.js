#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Icon generation script for AI Usage Tracker.
 * Converts resources/icon.png (512x512 recommended) to .ico and .icns formats.
 *
 * Usage: node scripts/generate-icons.js
 * Requires: npm install png2icons --save-dev
 */

const fs = require("fs");
const path = require("path");

const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");
const SOURCE_PNG = path.join(RESOURCES_DIR, "icon.png");

async function main() {
  if (!fs.existsSync(SOURCE_PNG)) {
    console.error("Error: resources/icon.png not found.");
    console.error("Please provide a 512x512 PNG icon first.");
    process.exit(1);
  }

  let png2icons;
  try {
    png2icons = require("png2icons");
  } catch {
    console.error("Error: png2icons not installed.");
    console.error("Run: npm install png2icons --save-dev");
    process.exit(1);
  }

  console.log("Reading source icon:", SOURCE_PNG);
  const sourceBuffer = fs.readFileSync(SOURCE_PNG);

  console.log("Generating icon.ico...");
  const icoBuffer = await png2icons.createICO(
    sourceBuffer,
    png2icons.BICUBIC,
    0,
    false,
    true,
  );
  if (icoBuffer) {
    fs.writeFileSync(path.join(RESOURCES_DIR, "icon.ico"), icoBuffer);
    console.log("  -> resources/icon.ico created");
  }

  console.log("Generating icon.icns...");
  const icnsBuffer = png2icons.createICNS(sourceBuffer, png2icons.BICUBIC);
  if (icnsBuffer) {
    fs.writeFileSync(path.join(RESOURCES_DIR, "icon.icns"), icnsBuffer);
    console.log("  -> resources/icon.icns created");
  }

  console.log("Icon generation complete!");
}

main().catch((error) => {
  console.error("Icon generation failed:", error);
  process.exit(1);
});
