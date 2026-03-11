import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { generateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { createApiKeySchema } from "@/lib/validations/api-key";

const MAX_ACTIVE_KEYS = 5;

export async function POST(req: Request): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) return unauthorized();

		const body = await req.json();
		const parsed = createApiKeySchema.safeParse(body);
		if (!parsed.success) {
			return badRequest("Invalid request", parsed.error.flatten());
		}

		const { rawKey, keyHash, keyPrefix } = generateApiKey();

		const apiKey = await prisma.$transaction(async (tx) => {
			const activeCount = await tx.apiKey.count({
				where: { userId: user.id, revokedAt: null },
			});
			if (activeCount >= MAX_ACTIVE_KEYS) {
				return null;
			}
			return tx.apiKey.create({
				data: {
					userId: user.id,
					name: parsed.data.name,
					keyHash,
					keyPrefix,
					expiresAt: parsed.data.expiresAt ?? null,
				},
			});
		});

		if (!apiKey) {
			return badRequest(
				`Maximum of ${MAX_ACTIVE_KEYS} active API keys allowed. Revoke an existing key first.`,
			);
		}

		return Response.json(
			{
				id: apiKey.id,
				name: apiKey.name,
				key: rawKey,
				keyPrefix: apiKey.keyPrefix,
				expiresAt: apiKey.expiresAt,
				createdAt: apiKey.createdAt,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error("[API Keys] Create error:", error);
		return serverError(error);
	}
}

export async function GET(): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) return unauthorized();

		const keys = await prisma.apiKey.findMany({
			where: { userId: user.id, revokedAt: null },
			orderBy: { createdAt: "desc" },
			select: {
				id: true,
				name: true,
				keyPrefix: true,
				lastUsedAt: true,
				expiresAt: true,
				createdAt: true,
			},
		});

		return Response.json({ keys });
	} catch (error) {
		console.error("[API Keys] List error:", error);
		return serverError(error);
	}
}
