import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads the datasource URL from schema.prisma or loads .env itself: the CLI
// (db push, generate, studio) gets the URL here, and the runtime client gets it through the driver
// adapter in src/db/client.ts. Scripts that need a .env wrap the CLI in dotenv-cli (see package.json).
export default defineConfig({
  schema: 'src/db/prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
