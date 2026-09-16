import readline from 'readline';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase } from '../config/db';
import { User, hashPassword } from '../models/User';
import { StorageAccount } from '../models/StorageAccount';

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  await connectDatabase();

  const email = (env.seedEmail || (await ask('Email: '))).toLowerCase();
  const password = env.seedPassword || (await ask('Password: '));

  if (password.length < 8) {
    console.error('Password must be at least 8 characters. Set SEED_PASSWORD in .env.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { passwordHash }, $setOnInsert: { email, name: email.split('@')[0] } },
    { upsert: true, new: true },
  );

  await StorageAccount.findOneAndUpdate(
    { user: user._id },
    { $setOnInsert: { user: user._id, usedBytes: 0, reservedBytes: 0, videoCount: 0 } },
    { upsert: true },
  );

  console.log(`Account ready: ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
