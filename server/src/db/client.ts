import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Prisma 7 talks to Postgres through a driver adapter rather than its own bundled query engine.
// DATABASE_URL is validated at startup by config/env.ts; it is read directly here so importing the
// client (e.g. from a unit test that mocks the database) doesn't require the full environment.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
