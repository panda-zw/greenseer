/**
 * Copies the built sidecar binary and Prisma engine into src-tauri/binaries/
 * so Tauri can bundle them into the app.
 *
 * Run after building the sidecar: pnpm build:sidecar
 */
import { cpSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, '..');
const sidecarDist = resolve(desktopRoot, '..', 'sidecar', 'dist');
const binariesDir = resolve(desktopRoot, 'src-tauri', 'binaries');

// Detect current platform target triple
function getTargetTriple() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const platform = process.platform;
  if (platform === 'darwin') return `${arch}-apple-darwin`;
  if (platform === 'win32') return `${arch}-pc-windows-msvc.exe`;
  if (platform === 'linux') return `${arch}-unknown-linux-gnu`;
  throw new Error(`Unsupported platform: ${platform}`);
}

const triple = getTargetTriple();
const sidecarBinary = join(sidecarDist, 'greenseer-sidecar');
const targetBinary = join(binariesDir, `greenseer-sidecar-${triple}`);

// 1. Copy sidecar binary
if (!existsSync(sidecarBinary)) {
  console.error(`Sidecar binary not found at ${sidecarBinary}`);
  console.error('Run "pnpm build:sidecar" in the sidecar package first.');
  process.exit(1);
}

mkdirSync(binariesDir, { recursive: true });
cpSync(sidecarBinary, targetBinary);
// Make executable
try { execSync(`chmod +x "${targetBinary}"`); } catch {}
console.log(`Copied sidecar binary -> ${targetBinary}`);

// 2. Copy Prisma query engine .node file
const engineFiles = readdirSync(sidecarDist).filter(f => f.endsWith('.node'));
for (const engine of engineFiles) {
  cpSync(join(sidecarDist, engine), join(binariesDir, engine));
  console.log(`Copied ${engine} -> binaries/`);
}

// 3. Copy prisma/schema.prisma
const schemaSrc = join(sidecarDist, 'prisma', 'schema.prisma');
if (existsSync(schemaSrc)) {
  mkdirSync(join(binariesDir, 'prisma'), { recursive: true });
  cpSync(schemaSrc, join(binariesDir, 'prisma', 'schema.prisma'));
  console.log('Copied schema.prisma -> binaries/prisma/');
}

console.log('Sidecar installed into Tauri binaries.');
