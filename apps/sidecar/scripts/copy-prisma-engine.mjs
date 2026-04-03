/**
 * Copies Prisma query engine and schema next to the sidecar binary
 * so the pkg-bundled binary can find them at runtime.
 */
import { cpSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidecarRoot = resolve(__dirname, '..');
const distDir = resolve(sidecarRoot, 'dist');

// Find the .prisma/client directory in the pnpm store
function findPrismaClient(startDir) {
  const pnpmDir = resolve(startDir, '..', '..', 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return null;

  for (const entry of readdirSync(pnpmDir)) {
    if (entry.startsWith('@prisma+client')) {
      const clientDir = join(pnpmDir, entry, 'node_modules', '.prisma', 'client');
      if (existsSync(clientDir)) return clientDir;
    }
  }
  return null;
}

const prismaClientDir = findPrismaClient(sidecarRoot);
if (!prismaClientDir) {
  console.error('Could not find .prisma/client directory');
  process.exit(1);
}

// Copy the query engine .node file to dist/
const engineFiles = readdirSync(prismaClientDir).filter(f => f.endsWith('.node'));
for (const engine of engineFiles) {
  const src = join(prismaClientDir, engine);
  const dest = join(distDir, engine);
  cpSync(src, dest);
  console.log(`Copied ${engine} to dist/`);
}

// Copy schema.prisma to dist/
const schemaPath = resolve(sidecarRoot, 'prisma', 'schema.prisma');
if (existsSync(schemaPath)) {
  mkdirSync(join(distDir, 'prisma'), { recursive: true });
  cpSync(schemaPath, join(distDir, 'prisma', 'schema.prisma'));
  console.log('Copied prisma/schema.prisma to dist/prisma/');
}

console.log('Prisma engine files ready for sidecar distribution.');
