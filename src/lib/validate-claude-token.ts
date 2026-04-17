export type ValidateResult =
	| { ok: true }
	| { ok: false; reason: "invalid" | "rate_limited" | "unknown" };

// Claude OAuth tokens (sk-ant-oat01-...) are scoped to Claude Code and reject
// the standard x-api-key auth flow. They must be sent as a Bearer token with
// the oauth beta header and a system prompt identifying as Claude Code.
export async function validateClaudeToken(
	token: string,
): Promise<ValidateResult> {
	try {
		const res = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"anthropic-version": "2023-06-01",
				"anthropic-beta": "oauth-2025-04-20",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 5,
				system: "You are Claude Code, Anthropic's official CLI for Claude.",
				messages: [{ role: "user", content: "say ok" }],
			}),
			signal: AbortSignal.timeout(10_000),
		});

		if (res.ok) return { ok: true };
		if (res.status === 401 || res.status === 403)
			return { ok: false, reason: "invalid" };
		if (res.status === 429) return { ok: false, reason: "rate_limited" };
		return { ok: false, reason: "unknown" };
	} catch {
		return { ok: false, reason: "unknown" };
	}
}
