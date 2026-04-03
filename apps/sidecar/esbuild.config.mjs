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
  ],
  logLevel: 'info',
});

console.log('Sidecar bundle created: dist/bundle.cjs');
