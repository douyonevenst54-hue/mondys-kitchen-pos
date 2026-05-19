import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use the direct (non-pooled) URL for Prisma CLI operations
    // like `prisma db push` and `prisma migrate`.
    url: env("DIRECT_URL"),
  },
});