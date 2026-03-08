import fs from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { Sandbox } from "@vercel/sandbox";
import type { MessageContentBlock } from "./content-blocks";

interface SSEConfig {
	streamToken: string;
	persistToken: string;
	persistUrl: string;
	chatId: string;
	port: number;
	initialPrompt: string;
	initialContentBlocks: MessageContentBlock[] | null;
	systemPrompt: string;
	model: string;
	allowedTools: string[];
	agentSessionId: string | null;
	maxThinkingTokens: number;
	initialSequenceNum: number;
	protectionBypassSecret: string | null;
	agents: Record<string, AgentDefinition> | null;
}

export async function writeSSEServerFiles(
	sandbox: Sandbox,
	config: SSEConfig,
): Promise<void> {
	const agentDir = path.join(process.cwd(), "src/lib/agent");

	const sseServerSource = fs.readFileSync(
		path.join(agentDir, "sandbox-sse-server.mjs"),
		"utf-8",
	);
	const translatorSource = fs.readFileSync(
		path.join(agentDir, "sdk-event-translator.mjs"),
		"utf-8",
	);

	await sandbox.writeFiles([
		{
			path: "/vercel/sandbox/sandbox-sse-server.mjs",
			content: Buffer.from(sseServerSource),
		},
		{
			path: "/vercel/sandbox/sdk-event-translator.mjs",
			content: Buffer.from(translatorSource),
		},
		{
			path: "/vercel/sandbox/sse-config.json",
			content: Buffer.from(JSON.stringify(config, null, 2)),
		},
	]);
}
