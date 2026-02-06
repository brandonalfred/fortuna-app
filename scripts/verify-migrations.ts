import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error("Missing DATABASE_URL_UNPOOLED or DATABASE_URL");
	process.exit(1);
}

const sql = neon(databaseUrl);

const failedMigrations = await sql`
	SELECT migration_name FROM _prisma_migrations
	WHERE applied_steps_count = 0 AND rolled_back_at IS NULL
`;

if (failedMigrations.length > 0) {
	console.error("Migrations recorded as applied but with 0 steps executed:");
	for (const row of failedMigrations) {
		console.error(`  - ${row.migration_name}`);
	}
	process.exit(1);
}

console.log("All migrations verified.");
