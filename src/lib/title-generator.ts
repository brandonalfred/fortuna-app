import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const anthropic = createAnthropic({
	apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN,
});

const TITLE_SYSTEM = `Generate a short, descriptive title (2-6 words) for a conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes, no punctuation at the end.`;

export async function generateChatTitle(
	userMessage: string,
): Promise<string | null> {
	try {
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			system: TITLE_SYSTEM,
			prompt: userMessage,
			maxTokens: 50,
			abortSignal: AbortSignal.timeout(5000),
		});

		return text.trim() || null;
	} catch (err) {
		console.warn("[Title Generator] Failed:", err);
		return null;
	}
}
