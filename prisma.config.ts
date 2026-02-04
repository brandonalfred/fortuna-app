import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use unpooled connection for migrations (DDL commands)
    url: env("DATABASE_URL_UNPOOLED") ?? env("DATABASE_URL"),
  },
});
