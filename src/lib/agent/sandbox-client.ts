import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";
import { prisma } from "@/lib/prisma";

interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
}

export interface SandboxAgentOptions {
	prompt: string;
	chatId: string;
	conversationHistory?: ConversationMessage[];
}

const SYSTEM_PROMPT_APPEND = `You are Fortuna, an AI sports betting analyst.

You help users analyze betting opportunities by:
- Fetching current odds from The Odds API using bash curl commands
- Researching team stats, injuries, and news via web search
- Writing analysis scripts when needed
- Providing data-driven insights

## The Odds API

The ODDS_API_KEY environment variable is available. Use it with curl to fetch data:

### List Available Sports
\`\`\`bash
curl -s "https://api.the-odds-api.com/v4/sports/?apiKey=\${ODDS_API_KEY}"
\`\`\`

Common sport keys:
- basketball_nba - NBA
- americanfootball_nfl - NFL
- baseball_mlb - MLB
- icehockey_nhl - NHL
- soccer_epl - English Premier League
- soccer_usa_mls - MLS

### Get Odds for a Sport
\`\`\`bash
curl -s "https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/odds/?apiKey=\${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american"
\`\`\`

### Get Scores (live & recent)
\`\`\`bash
curl -s "https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/scores/?apiKey=\${ODDS_API_KEY}&daysFrom=1"
\`\`\`

### Markets Available
- h2h - Moneyline/head-to-head
- spreads - Point spreads/handicaps
- totals - Over/under totals

Always cite your sources and explain your reasoning. Compare odds across multiple sportsbooks when available.`;

async function getOrCreateSandbox(chatId: string): Promise<Sandbox> {
	const chat = await prisma.chat.findUnique({ where: { id: chatId } });

	if (chat?.sandboxId) {
		try {
			const existing = await Sandbox.get({ sandboxId: chat.sandboxId });
			console.log("[Sandbox] Reusing existing sandbox:", chat.sandboxId);
			return existing;
		} catch (error) {
			console.log(
				"[Sandbox] Existing sandbox expired or unavailable:",
				error instanceof Error ? error.message : error,
			);
		}
	}

	const snapshotId = process.env.AGENT_SANDBOX_SNAPSHOT_ID;
	console.log(
		"[Sandbox] Creating new sandbox",
		snapshotId ? `from snapshot: ${snapshotId}` : "(no snapshot)",
	);

	const sandbox = await Sandbox.create({
		...(snapshotId
			? { source: { type: "snapshot", snapshotId } }
			: { runtime: "node22" }),
		resources: { vcpus: 4 },
		timeout: ms("45m"),
	});

	console.log("[Sandbox] Created new sandbox:", sandbox.sandboxId);

	if (!snapshotId) {
		console.log("[Sandbox] Installing Claude Code CLI...");
		const installResult = await sandbox.runCommand({
			cmd: "bash",
			args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
		});
		console.log("[Sandbox] CLI install exit code:", installResult.exitCode);

		console.log("[Sandbox] Installing SDKs...");
		const npmResult = await sandbox.runCommand({
			cmd: "npm",
			args: ["install", "@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk"],
		});
		console.log("[Sandbox] npm install exit code:", npmResult.exitCode);
	}

	await prisma.chat.update({
		where: { id: chatId },
		data: { sandboxId: sandbox.sandboxId },
	});

	return sandbox;
}

function generateAgentScript(options: SandboxAgentOptions): string {
	const escapedPrompt = JSON.stringify(options.prompt);
	const escapedHistory = JSON.stringify(options.conversationHistory || []);
	const escapedSystemPrompt = JSON.stringify(SYSTEM_PROMPT_APPEND);

	return `
import { query } from '@anthropic-ai/claude-agent-sdk';

const prompt = ${escapedPrompt};
const conversationHistory = ${escapedHistory};
const systemPromptAppend = ${escapedSystemPrompt};

async function main() {
  try {
    let fullPrompt = prompt;

    if (conversationHistory.length > 0) {
      const historyText = conversationHistory
        .map((msg) => \`\${msg.role === 'user' ? 'User' : 'Assistant'}: \${msg.content}\`)
        .join('\\n\\n');
      fullPrompt = \`Previous conversation:\\n\${historyText}\\n\\nUser: \${prompt}\`;
    }

    const generator = query({
      prompt: fullPrompt,
      options: {
        cwd: '/vercel/sandbox',
        model: 'claude-opus-4-5-20251101',
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
        permissionMode: 'acceptEdits',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPromptAppend,
        },
        abortController: new AbortController(),
        includePartialMessages: true,
        maxThinkingTokens: 10000,
      },
    });

    for await (const message of generator) {
      console.log(JSON.stringify({ type: 'sdk_message', data: message }));
    }

    console.log(JSON.stringify({ type: 'complete' }));
  } catch (error) {
    console.log(JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    }));
    process.exit(1);
  }
}

main();
`;
}

export async function* streamAgentResponseViaSandbox(
	options: SandboxAgentOptions,
): AsyncGenerator<SDKMessage> {
	console.log("[Sandbox] Starting streamAgentResponseViaSandbox");
	const sandbox = await getOrCreateSandbox(options.chatId);

	try {
		const script = generateAgentScript(options);
		console.log("[Sandbox] Writing agent runner script...");

		await sandbox.writeFiles([
			{
				path: "/vercel/sandbox/agent-runner.mjs",
				content: Buffer.from(script),
			},
		]);

		console.log("[Sandbox] Starting agent command...");
		const cmd = await sandbox.runCommand({
			cmd: "node",
			args: ["agent-runner.mjs"],
			env: {
				CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
				ODDS_API_KEY: process.env.ODDS_API_KEY || "",
			},
			detached: true,
		});

		let buffer = "";

		for await (const log of cmd.logs()) {
			if (log.stream === "stdout") {
				buffer += log.data;

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const parsed = JSON.parse(line);

						if (parsed.type === "sdk_message") {
							yield parsed.data as SDKMessage;
						} else if (parsed.type === "error") {
							throw new Error(parsed.error);
						} else if (parsed.type === "complete") {
							console.log("[Sandbox] Agent completed successfully");
						}
					} catch (parseError) {
						if (parseError instanceof SyntaxError && !line.startsWith("{")) {
							console.log("[Sandbox] Non-JSON output:", line);
						} else if (!(parseError instanceof SyntaxError)) {
							throw parseError;
						}
					}
				}
			} else if (log.stream === "stderr") {
				console.log("[Sandbox] stderr:", log.data);
			}
		}

		if (buffer.trim()) {
			try {
				const parsed = JSON.parse(buffer);
				if (parsed.type === "sdk_message") {
					yield parsed.data as SDKMessage;
				} else if (parsed.type === "error") {
					throw new Error(parsed.error);
				}
			} catch {
				console.log("[Sandbox] Final buffer (non-JSON):", buffer);
			}
		}

		const result = await cmd.wait();
		console.log("[Sandbox] Command finished with exit code:", result.exitCode);

		if (result.exitCode !== 0) {
			throw new Error(`Agent process exited with code ${result.exitCode}`);
		}

		console.log("[Sandbox] Extending sandbox timeout...");
		await sandbox.extendTimeout(ms("45m"));
	} catch (error) {
		console.error("[Sandbox] Error during execution:", error);
		try {
			console.log("[Sandbox] Stopping sandbox due to error...");
			await sandbox.stop();
			await prisma.chat.update({
				where: { id: options.chatId },
				data: { sandboxId: null },
			});
		} catch (stopError) {
			console.error("[Sandbox] Failed to stop sandbox:", stopError);
		}
		throw error;
	}
}
