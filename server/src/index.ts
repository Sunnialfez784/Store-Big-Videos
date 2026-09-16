import { env } from './config/env';
import { connectDatabase } from './config/db';
import { createApp } from './app';
import { startSweeper } from './services/sweeper';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connectWithRetry() {
  while (true) {
    try {
      await connectDatabase();
      return;
    } catch (err) {
      console.error('[db] connection failed; retrying in 5 seconds', err);
      await wait(5_000);
    }
  }
}

async function bootstrap() {
  await connectWithRetry();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] listening on :${env.port} (${env.nodeEnv})`);
  });

  // Long multipart part uploads never traverse this server, but presign
  // requests should not be cut short either.
  server.requestTimeout = 0;
  server.headersTimeout = 120_000;

  const sweeper = startSweeper();

  const shutdown = (signal: string) => {
    console.log(`[server] ${signal} received, shutting down`);
    clearInterval(sweeper);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => console.error('[server] unexpected failure:', err));
