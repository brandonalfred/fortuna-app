import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

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

export type AgentMessage = SDKMessage;

export interface StreamAgentOptions {
	prompt: string;
	workspacePath: string;
	resumeSessionId?: string;
	abortController?: AbortController;
}

export async function* streamAgentResponse({
	prompt,
	workspacePath,
	resumeSessionId,
	abortController,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	const generator = query({
		prompt,
		options: {
			cwd: workspacePath,
			model: "claude-sonnet-4-5-20250929",
			allowedTools: [
				"Read",
				"Write",
				"Edit",
				"Glob",
				"Grep",
				"Bash",
				"WebSearch",
				"WebFetch",
			],
			permissionMode: "acceptEdits",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: SYSTEM_PROMPT_APPEND,
			},
			resume: resumeSessionId,
			abortController: abortController ?? new AbortController(),
			includePartialMessages: true,
		},
	});

	for await (const message of generator) {
		yield message;
	}
}

interface TextBlock {
	type: "text";
	text: string;
}

interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

type ContentBlock = TextBlock | ToolUseBlock | { type: string };

export function extractTextFromMessage(message: SDKMessage): string | null {
	if (message.type !== "assistant") {
		return null;
	}

	const content = message.message.content as ContentBlock[];
	const textBlocks = content.filter(
		(block): block is TextBlock => block.type === "text",
	);

	return textBlocks.map((block) => block.text).join("");
}

export function extractToolUseFromMessage(
	message: SDKMessage,
): Array<{ id: string; name: string; input: unknown }> | null {
	if (message.type !== "assistant") {
		return null;
	}

	const content = message.message.content as ContentBlock[];
	const toolUseBlocks = content.filter(
		(block): block is ToolUseBlock => block.type === "tool_use",
	);

	return toolUseBlocks.map((block) => ({
		id: block.id,
		name: block.name,
		input: block.input,
	}));
}
