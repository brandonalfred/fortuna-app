import { query } from "@anthropic-ai/claude-agent-sdk";
import { getClaudeCodeCliPath } from "@/lib/agent/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("TitleGenerator");

const cliPath = getClaudeCodeCliPath();

export async function generateChatTitle(
	userMessage: string,
): Promise<string | null> {
	try {
		const prompt = `Generate a short, descriptive title (2-6 words) for a conversation that starts with the following message. Return ONLY the title text, nothing else. No quotes, no punctuation at the end.\n\nMessage: "${userMessage.slice(0, 500)}"`;

		const q = query({
			prompt,
			options: {
				model: "claude-haiku-4-5-20251001",
				systemPrompt:
					"You are a title generator. Output only the title, nothing else.",
				maxTurns: 1,
				thinking: { type: "disabled" },
				allowedTools: [],
				permissionMode: "dontAsk",
				pathToClaudeCodeExecutable: cliPath,
			},
		});

		let title = "";
		const timeout = setTimeout(() => q.close(), 10000);

		try {
			for await (const msg of q) {
				if (msg.type === "assistant") {
					for (const block of msg.message.content) {
						if (block.type === "text") {
							title += block.text;
						}
					}
				}
			}
		} finally {
			clearTimeout(timeout);
		}

		const result = title.trim() || null;
		log.info("Generated title", { title: result });
		return result;
	} catch (err) {
		log.error("Agent SDK title generation failed", err);
		return null;
	}
}
