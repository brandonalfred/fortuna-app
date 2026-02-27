import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error("Missing DATABASE_URL_UNPOOLED or DATABASE_URL");
	process.exit(1);
}

const email = process.argv[2];

if (!email) {
	console.error("Usage: bun scripts/seed-admin.ts <email>");
	process.exit(1);
}

const sql = neon(databaseUrl);

const result = await sql`
	UPDATE "user" SET "role" = 'admin' WHERE "email" = ${email} RETURNING "id"
`;

if (result.length === 0) {
	console.error(`No user found with email: ${email}`);
	process.exit(1);
}

console.log(`Successfully set admin role for: ${email}`);
