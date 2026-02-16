import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is required");
	}

	const adapter = new PrismaNeon({ connectionString });

	return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

const TRANSIENT_DB_PATTERNS = [
	"NeonDbError",
	"requested endpoint could not be found",
	"password authentication failed",
	"Connection terminated",
	"ECONNRESET",
];

export function isTransientDbError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return TRANSIENT_DB_PATTERNS.some((pattern) => msg.includes(pattern));
}

export async function retryOnTransientError<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
): Promise<T> {
	let attempt = 0;
	while (true) {
		try {
			return await fn();
		} catch (error) {
			const retriable = isTransientDbError(error) && attempt < maxRetries;
			if (!retriable) throw error;

			const baseMs = 500 * 2 ** attempt;
			const jitter = Math.random() * baseMs * 0.5;
			const delayMs = baseMs + jitter;
			console.warn(
				`[Prisma] Transient error (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(delayMs)}ms`,
			);
			await new Promise((r) => setTimeout(r, delayMs));
			attempt++;
		}
	}
}
