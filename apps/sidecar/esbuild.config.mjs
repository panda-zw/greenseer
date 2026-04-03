import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['dist/main.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  external: [
    '@prisma/client',
    '.prisma/client',
    'fsevents',
    // Optional NestJS modules (loaded dynamically, not used)
    '@nestjs/microservices',
    '@nestjs/microservices/microservices-module',
    '@nestjs/websockets',
    '@nestjs/websockets/socket-module',
    // Playwright internals (loaded at runtime, not bundleable)
    'playwright-core',
    'chromium-bidi',
    'chromium-bidi/lib/cjs/bidiMapper/BidiMapper',
    'chromium-bidi/lib/cjs/cdp/CdpConnection',
    // Native modules
    'sharp',
    'tesseract.js',
  ],
  logLevel: 'info',
});

console.log('Sidecar bundle created: dist/bundle.cjs');
