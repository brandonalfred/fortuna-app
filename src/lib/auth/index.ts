import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
	baseURL:
		process.env.BETTER_AUTH_URL ??
		(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
	trustedOrigins: [
		process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
		process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
		process.env.VERCEL_PROJECT_PRODUCTION_URL &&
			`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
	].filter(Boolean) as string[],
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
	},
	user: {
		additionalFields: {
			firstName: { type: "string", required: true },
			lastName: { type: "string", required: true },
			phoneNumber: { type: "string", required: true },
		},
	},
	plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
