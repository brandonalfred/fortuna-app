import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("TitleGenerator");

export async function generateChatTitle(
	userMessage: string,
	apiKey: string,
): Promise<string | null> {
	try {
		const anthropic = createAnthropic({ apiKey });
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			system: "You are a title generator. Output only the title, nothing else.",
			prompt: `Generate a short, descriptive title (2-6 words) for a conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes, no punctuation at the end.\n\nMessage: "${userMessage.slice(0, 500)}"`,
			maxOutputTokens: 30,
		});

		const result = text.trim() || null;
		log.info("Generated title", { title: result });
		return result;
	} catch (err) {
		log.error("Title generation failed", err);
		return null;
	}
}
