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

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isTransientDbError(error: unknown): boolean {
	const msg = errorMessage(error);
	return TRANSIENT_DB_PATTERNS.some((pattern) => msg.includes(pattern));
}

export async function retryOnTransientError<T>(
	fn: () => Promise<T>,
	delayMs = 1000,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (!isTransientDbError(error)) throw error;
		console.warn("[Prisma] Transient DB error, retrying:", error);
		await new Promise((r) => setTimeout(r, delayMs));
		return fn();
	}
}
