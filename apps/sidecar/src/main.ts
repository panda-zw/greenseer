// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv/config');
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { createServer } from 'net';

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + 9}`);
}

async function bootstrap() {
  const preferredPort = parseInt(process.env.SIDECAR_PORT || '11434', 10);
  const port = await findFreePort(preferredPort);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin, curl, sidecar-to-sidecar)
      if (!origin) return callback(null, true);
      // Allow Tauri webview origins (varies by platform)
      if (origin.includes('tauri.localhost') || origin.startsWith('tauri://')) return callback(null, true);
      // Allow Vite dev server
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      callback(new Error('CORS not allowed'), false);
    },
  });

  await app.listen(port, '127.0.0.1');

  // Signal to parent process (Tauri) that we're ready
  console.log(`SIDECAR_READY:${port}`);

  // Graceful shutdown — kill browsers and close DB on exit
  const shutdown = async () => {
    console.log('[sidecar] Shutting down...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGHUP', shutdown);
}

bootstrap();
