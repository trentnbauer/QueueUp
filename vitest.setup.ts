import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Server-side test files transitively import env.ts (via redisClient.ts etc.), which validates
// process.env at import time - mirrors how bootstrap.ts loads the root .env for the real app.
config({ path: path.resolve(__dirname, '.env') });
