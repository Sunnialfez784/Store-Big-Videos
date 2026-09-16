import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import videoRoutes from './routes/video.routes';
import storageRoutes from './routes/storage.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { ok } from './utils/apiResponse';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowedOrigins = env.frontendUrl.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  // NOTE: there is deliberately no app-wide express.json(). Body parsing is
  // attached route by route with small limits, so video bytes never pass
  // through this process.

  app.get('/api/health', (_req, res) => ok(res, { status: 'up', provider: env.storage.provider }, 'Healthy.'));

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/videos', videoRoutes);
  app.use('/api/storage', storageRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
