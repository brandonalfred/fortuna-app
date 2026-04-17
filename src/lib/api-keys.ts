import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const API_KEY_PREFIX = "ftn_";

export function generateApiKey(): {
	rawKey: string;
	keyHash: string;
	keyPrefix: string;
} {
	const raw = randomBytes(48).toString("base64url");
	const rawKey = `${API_KEY_PREFIX}${raw}`;
	return {
		rawKey,
		keyHash: hashApiKey(rawKey),
		keyPrefix: rawKey.slice(0, 12),
	};
}

export function hashApiKey(key: string): string {
	const pepper = process.env.API_KEY_HASH_SECRET;
	if (pepper) {
		return createHmac("sha256", pepper).update(key).digest("hex");
	}
	if (process.env.NODE_ENV === "production") {
		throw new Error("API_KEY_HASH_SECRET must be set in production");
	}
	return createHash("sha256").update(key).digest("hex");
}

export function activeKeyWhere(userId: string) {
	return {
		userId,
		revokedAt: null,
		OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
	};
}

export function isApiKeyFormat(value: string): boolean {
	return (
		value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length
	);
}

export async function resolveUserFromApiKey(
	rawKey: string,
): Promise<Session["user"] | null> {
	const hash = hashApiKey(rawKey);

	const apiKey = await prisma.apiKey.findUnique({
		where: { keyHash: hash },
		include: { user: true },
	});

	if (!apiKey) return null;
	if (apiKey.revokedAt) return null;
	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

	const { user } = apiKey;
	if (user.banned) return null;

	prisma.apiKey
		.update({
			where: { id: apiKey.id },
			data: { lastUsedAt: new Date() },
		})
		.catch((e: unknown) =>
			console.warn("[API Key] Failed to update lastUsedAt:", e),
		);

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		firstName: user.firstName,
		lastName: user.lastName,
		phoneNumber: user.phoneNumber,
		preferences: user.preferences ?? undefined,
		hasClaudeToken: user.hasClaudeToken,
		emailVerified: user.emailVerified,
		image: user.image,
		role: user.role,
		banned: user.banned ?? false,
		banReason: user.banReason,
		banExpires: user.banExpires,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	} satisfies Session["user"];
}
