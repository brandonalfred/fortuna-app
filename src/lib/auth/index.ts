import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { sendOTPEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { sendOTPSMS } from "@/lib/sms";
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	passwordRequirements,
} from "@/lib/validations/auth";

export const auth = betterAuth({
	baseURL:
		process.env.BETTER_AUTH_URL ??
		(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
	trustedOrigins: [
		"https://fortunabets.ai",
		"https://www.fortunabets.ai",
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
		minPasswordLength: PASSWORD_MIN_LENGTH,
		maxPasswordLength: PASSWORD_MAX_LENGTH,
	},
	user: {
		additionalFields: {
			firstName: { type: "string", required: true },
			lastName: { type: "string", required: true },
			phoneNumber: { type: "string", required: true },
			preferences: { type: "string", required: false },
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-up/email") return;
			const password = ctx.body?.password;
			if (!password) return;
			const failed = passwordRequirements.find((req) => !req.test(password));
			if (failed) {
				throw new APIError("BAD_REQUEST", {
					message: failed.label,
				});
			}
		}),
	},
	plugins: [
		nextCookies(),
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
		}),
		twoFactor({
			skipVerificationOnEnable: true,
			otpOptions: {
				sendOTP({ user, otp }, ctx) {
					const channel = ctx?.headers?.get("x-otp-channel");
					const phoneNumber = (user as unknown as { phoneNumber?: string })
						.phoneNumber;
					return channel === "phone" && phoneNumber
						? sendOTPSMS(phoneNumber, otp)
						: sendOTPEmail(user.email, otp);
				},
				period: 3,
			},
			backupCodeOptions: {
				amount: 10,
				length: 10,
			},
		}),
	],
});

export type Session = typeof auth.$Infer.Session;
