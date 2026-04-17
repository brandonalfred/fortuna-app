import { getUserClaudeToken } from "@/lib/user-token";

export type TokenGate =
	| { ok: true; token: string }
	| { ok: false; response: Response };

export async function requireUserClaudeToken(
	userId: string,
): Promise<TokenGate> {
	const token = await getUserClaudeToken(userId);
	if (!token) {
		return {
			ok: false,
			response: Response.json(
				{
					error: "token_required",
					message:
						"Connect your Claude OAuth token in Settings → Profile to use the agent.",
				},
				{ status: 403 },
			),
		};
	}
	return { ok: true, token };
}
