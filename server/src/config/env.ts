import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid numeric env var: ${name}`);
  return parsed;
}

const GB = 1024 ** 3;

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num('PORT', 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  seedEmail: process.env.SEED_EMAIL ?? 'owner@example.com',
  seedPassword: process.env.SEED_PASSWORD ?? '',

  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 's3',
    bucket: required('STORAGE_BUCKET'),
    region: process.env.STORAGE_REGION ?? 'auto',
    accessKey: required('STORAGE_ACCESS_KEY'),
    secretKey: required('STORAGE_SECRET_KEY'),
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  },

  quota: {
    totalBytes: num('TOTAL_STORAGE_BYTES', 42 * GB),
    maxVideoBytes: num('MAX_VIDEO_BYTES', 15 * GB),
    partSize: num('UPLOAD_PART_SIZE_BYTES', 64 * 1024 * 1024),
  },

  // Multipart sessions idle for longer than this are aborted and refunded.
  uploadSessionTtlMs: 24 * 60 * 60 * 1000,
};
