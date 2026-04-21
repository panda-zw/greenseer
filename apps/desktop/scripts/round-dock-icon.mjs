#!/usr/bin/env node
/**
 * Bake macOS-style squircle rounding + inset padding into the dock icon
 * (`icon.png` and `icon.icns`).
 *
 * Why this exists:
 * - macOS does NOT auto-round app icons — every dock icon you see has the
 *   shape baked into the asset with transparent corners.
 * - Our source icon is a flat square with content going edge-to-edge, so in
 *   the dock it sticks out against the other apps' squircles.
 * - The tray icon is rounded separately at runtime in `src-tauri/src/tray.rs`
 *   with a DIFFERENT framing (no inset) so it reads at 16-22px. We do NOT
 *   touch `128x128.png`, `128x128@2x.png` or `32x32.png` here — those are the
 *   source for the tray.
 *
 * Run with: `node apps/desktop/scripts/round-dock-icon.mjs`
 * Requires: `sharp` (resolved from the sidecar package's node_modules) and
 *           macOS's built-in `iconutil`.
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve sharp from the sidecar package, which already depends on it.
const sidecarRequire = createRequire(join(__dirname, '..', '..', 'sidecar', 'package.json'));
const sharp = sidecarRequire('sharp');

const ICONS_DIR = join(__dirname, '..', 'src-tauri', 'icons');
const MASTER = join(ICONS_DIR, 'icon.png');
const ICNS_OUT = join(ICONS_DIR, 'icon.icns');
const WORK = join(__dirname, '..', '.icon-work');

// macOS icon grid: 1024px canvas with ~10% inset and ~22% corner radius on
// the content area. These ratios match Apple's icon template.
const CANVAS = 1024;
const INSET = Math.round(CANVAS * 0.10);    // 102 px
const CONTENT = CANVAS - INSET * 2;         // 820 px
const RADIUS = Math.round(CONTENT * 0.22);  // ~180 px

async function run() {
  console.log(`Master: ${MASTER}`);
  console.log(`Canvas: ${CANVAS}  Inset: ${INSET}  Content: ${CONTENT}  Radius: ${RADIUS}`);

  // 1. Resize source content to fit inside the padded area.
  const content = await sharp(MASTER)
    .resize(CONTENT, CONTENT, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // 2. Build a rounded-rectangle SVG mask.
  const mask = Buffer.from(
    `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
       <rect x="${INSET}" y="${INSET}" width="${CONTENT}" height="${CONTENT}"
             rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/>
     </svg>`,
  );

  // 3. Transparent canvas → place content at inset → mask with rounded rect.
  const rounded = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: content, top: INSET, left: INSET },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();

  // 4. Overwrite the master icon.png.
  await sharp(rounded).toFile(MASTER);
  console.log(`  wrote ${MASTER}`);

  // 5. Generate the full .iconset for macOS iconutil.
  rmSync(WORK, { recursive: true, force: true });
  const iconsetDir = join(WORK, 'icon.iconset');
  mkdirSync(iconsetDir, { recursive: true });

  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, size] of sizes) {
    await sharp(rounded)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(iconsetDir, name));
  }
  console.log(`  built iconset with ${sizes.length} sizes`);

  // 6. Call iconutil to package the iconset as .icns.
  execSync(`iconutil -c icns "${iconsetDir}" -o "${ICNS_OUT}"`, { stdio: 'inherit' });
  console.log(`  wrote ${ICNS_OUT}`);

  rmSync(WORK, { recursive: true, force: true });
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
