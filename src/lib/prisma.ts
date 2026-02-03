import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

function createPrismaClient() {
	const accelerateUrl =
		process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;

	return new PrismaClient({
		accelerateUrl,
	}).$extends(withAccelerate());
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
	prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
