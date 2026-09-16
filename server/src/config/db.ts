import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.databaseUrl, { serverSelectionTimeoutMS: 10_000 });
  console.log('[db] connected');
}
