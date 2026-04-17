import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export type ValidateResult =
	| { ok: true }
	| { ok: false; reason: "invalid" | "rate_limited" | "unknown" };

export async function validateClaudeToken(
	token: string,
): Promise<ValidateResult> {
	try {
		const anthropic = createAnthropic({ apiKey: token });
		await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			prompt: "say ok",
			maxOutputTokens: 5,
		});
		return { ok: true };
	} catch (err) {
		const status =
			(err as { statusCode?: number; status?: number })?.statusCode ??
			(err as { status?: number })?.status;
		if (status === 401 || status === 403)
			return { ok: false, reason: "invalid" };
		if (status === 429) return { ok: false, reason: "rate_limited" };
		return { ok: false, reason: "unknown" };
	}
}
