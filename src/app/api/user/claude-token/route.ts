import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { setUserClaudeToken } from "@/lib/user-token";
import { validateClaudeToken } from "@/lib/validate-claude-token";
import { claudeTokenSchema } from "@/lib/validations/user";

export async function POST(req: Request): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) return unauthorized();

		const body = await req.json();
		const parsed = claudeTokenSchema.safeParse(body);
		if (!parsed.success) {
			return badRequest("Invalid token format", parsed.error.flatten());
		}

		const result = await validateClaudeToken(parsed.data.token);
		if (!result.ok) {
			const message =
				result.reason === "invalid"
					? "Token rejected by Anthropic. Double-check the value."
					: result.reason === "rate_limited"
						? "Anthropic rate-limited the validation request. Try again shortly."
						: "Could not validate the token. Try again.";
			return Response.json(
				{ ok: false, code: result.reason, message },
				{ status: result.reason === "rate_limited" ? 429 : 400 },
			);
		}

		await setUserClaudeToken(user.id, parsed.data.token);

		return Response.json({ ok: true });
	} catch (error) {
		console.error("[Claude Token API] POST error:", error);
		return serverError(error);
	}
}

export async function DELETE(): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) return unauthorized();

		await setUserClaudeToken(user.id, null);

		return Response.json({ ok: true });
	} catch (error) {
		console.error("[Claude Token API] DELETE error:", error);
		return serverError(error);
	}
}
