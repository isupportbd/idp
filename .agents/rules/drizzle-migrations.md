---
name: Drizzle Migrations Rule
description: Instructions for handling Drizzle ORM schema changes.
---

# Drizzle ORM Migration Rules

Whenever you modify the database schema (e.g., `apps/api/src/db/schema.ts`), you **MUST** generate the SQL migration files before finishing your task.

### Steps to follow:
1. Navigate to the `apps/api` directory: `cd apps/api`
2. Run the generate command: `npm run db:generate` (or `bun run db:generate`)
3. Ensure the new `.sql` file is created in the `apps/api/drizzle` folder.

**CRITICAL:** Do NOT skip this step! The live server (running on Coolify) relies entirely on these generated `.sql` files to perform automatic database migrations when the server restarts. If you forget to run this command, the production database will not receive the schema updates.
