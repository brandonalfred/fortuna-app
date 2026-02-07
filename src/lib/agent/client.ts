import fs from "node:fs";
import path from "node:path";
import {
	type Query,
	query,
	type SDKMessage,
	type SDKUserMessage,
	type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEZONE = "America/New_York";

const AGENT_MODEL = "claude-opus-4-6";

const AGENT_ALLOWED_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"Glob",
	"Grep",
	"Bash",
	"WebSearch",
	"WebFetch",
	"Skill",
];

function formatCurrentDate(timezone: string): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return formatter.format(new Date());
}

function getSystemPrompt(timezone?: string): string {
	const promptPath = path.join(process.cwd(), "src/lib/agent/system-prompt.md");
	const basePrompt = fs.readFileSync(promptPath, "utf-8");

	const currentDate = formatCurrentDate(timezone || DEFAULT_TIMEZONE);
	const dateContext = `\n\nIMPORTANT: Today's date is ${currentDate}. Use this as the reference for "today", "yesterday", "tomorrow", etc.\n`;

	return basePrompt + dateContext;
}

function getSkillFiles(): Array<{ name: string; content: string }> {
	const skillsDir = path.join(process.cwd(), ".claude/skills");
	const skills: Array<{ name: string; content: string }> = [];

	if (fs.existsSync(skillsDir)) {
		for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
				if (fs.existsSync(skillPath)) {
					skills.push({
						name: entry.name,
						content: fs.readFileSync(skillPath, "utf-8"),
					});
				}
			}
		}
	}
	return skills;
}

function getClaudeCodeCliPath(): string {
	const cliPath = path.join(
		process.cwd(),
		"node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
	);

	if (!fs.existsSync(cliPath)) {
		throw new Error(
			`Claude Agent SDK CLI not found at ${cliPath}. The SDK requires the CLI to be present.`,
		);
	}

	return cliPath;
}

export type { Query };
export type AgentMessage = SDKMessage;

interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
	thinking?: string | null;
}

export interface StreamAgentOptions {
	prompt: string;
	workspacePath: string;
	chatId: string;
	conversationHistory?: ConversationMessage[];
	abortController?: AbortController;
	timezone?: string;
	agentSessionId?: string;
}

function buildFullPrompt(
	prompt: string,
	conversationHistory: ConversationMessage[],
): string {
	if (conversationHistory.length === 0) {
		return prompt;
	}

	const historyText = conversationHistory
		.map((msg) => {
			if (msg.role === "user") {
				return `User: ${msg.content}`;
			}
			const thinkingPart = msg.thinking
				? `[Your internal reasoning]: ${msg.thinking}\n\n`
				: "";
			return `${thinkingPart}Assistant: ${msg.content}`;
		})
		.join("\n\n");

	return `Previous conversation:\n${historyText}\n\nUser: ${prompt}`;
}

export async function* streamAgentResponse(
	options: StreamAgentOptions,
): AsyncGenerator<SDKMessage> {
	yield* streamViaSandbox(options);
}

async function* singleMessageStream(
	message: string,
): AsyncGenerator<SDKUserMessage> {
	yield {
		type: "user" as const,
		session_id: "",
		message: {
			role: "user" as const,
			content: [{ type: "text" as const, text: message }],
		},
		parent_tool_use_id: null,
	};
}

function buildQueryOptions(
	workspacePath: string,
	abortController: AbortController,
	timezone?: string,
	agentSessionId?: string,
) {
	return {
		cwd: workspacePath,
		model: AGENT_MODEL,
		pathToClaudeCodeExecutable: getClaudeCodeCliPath(),
		settingSources: ["project"] satisfies SettingSource[],
		allowedTools: AGENT_ALLOWED_TOOLS,
		permissionMode: "acceptEdits" as const,
		systemPrompt: {
			type: "preset" as const,
			preset: "claude_code" as const,
			append: getSystemPrompt(timezone),
		},
		abortController,
		includePartialMessages: true,
		resume: agentSessionId,
	};
}

export function createLocalAgentQuery({
	prompt,
	workspacePath,
	conversationHistory = [],
	abortController = new AbortController(),
	timezone,
	agentSessionId,
}: StreamAgentOptions): Query {
	const effectivePrompt = agentSessionId
		? prompt
		: buildFullPrompt(prompt, conversationHistory);

	return query({
		prompt: singleMessageStream(effectivePrompt),
		options: buildQueryOptions(
			workspacePath,
			abortController,
			timezone,
			agentSessionId,
		),
	});
}

async function runSandboxCommand(
	sandbox: Sandbox,
	options: { cmd: string; args: string[]; sudo?: boolean },
	description: string,
): Promise<void> {
	console.log(`[Sandbox] ${description}...`);
	const result = await sandbox.runCommand(options);
	if (result.exitCode !== 0) {
		throw new Error(`${description} failed (exit code ${result.exitCode})`);
	}
}

interface SandboxResult {
	sandbox: Sandbox;
	sandboxReused: boolean;
	previousAgentSessionId: string | null;
}

async function getOrCreateSandbox(chatId: string): Promise<SandboxResult> {
	const chat = await prisma.chat.findUnique({ where: { id: chatId } });
	const previousAgentSessionId = chat?.agentSessionId ?? null;

	if (chat?.sandboxId) {
		try {
			const existing = await Sandbox.get({ sandboxId: chat.sandboxId });
			console.log("[Sandbox] Reusing existing sandbox:", chat.sandboxId);
			return {
				sandbox: existing,
				sandboxReused: true,
				previousAgentSessionId,
			};
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
		await runSandboxCommand(
			sandbox,
			{
				cmd: "bash",
				args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
			},
			"Installing Claude Code CLI",
		);

		await runSandboxCommand(
			sandbox,
			{
				cmd: "npm",
				args: [
					"install",
					"@anthropic-ai/claude-agent-sdk",
					"@anthropic-ai/sdk",
				],
			},
			"Installing SDKs",
		);

		await runSandboxCommand(
			sandbox,
			{
				cmd: "bash",
				args: [
					"-c",
					"dnf install -y python3 python3-pip python3-devel jq sqlite libxml2-devel libxslt-devel",
				],
				sudo: true,
			},
			"Installing Python 3, pip, and system tools",
		);

		await runSandboxCommand(
			sandbox,
			{
				cmd: "bash",
				args: [
					"-c",
					[
						"pip3 install --break-system-packages",
						"pandas numpy scipy",
						"requests httpx beautifulsoup4 lxml",
						"python-dateutil pytz",
						"matplotlib",
						"scikit-learn",
						"duckdb",
						"nba_api",
					].join(" "),
				],
				sudo: true,
			},
			"Installing Python packages",
		);
	}

	const skills = getSkillFiles();
	console.log(`[Sandbox] Setting up ${skills.length} skills...`);

	for (const skill of skills) {
		const skillDir = `/vercel/sandbox/.claude/skills/${skill.name}`;
		await sandbox.runCommand({
			cmd: "mkdir",
			args: ["-p", skillDir],
		});
		await sandbox.writeFiles([
			{
				path: `${skillDir}/SKILL.md`,
				content: Buffer.from(skill.content),
			},
		]);
		console.log(`[Sandbox] Copied skill: ${skill.name}`);
	}

	await prisma.chat.update({
		where: { id: chatId },
		data: { sandboxId: sandbox.sandboxId, agentSessionId: null },
	});

	return { sandbox, sandboxReused: false, previousAgentSessionId: null };
}

function generateAgentScript(
	fullPrompt: string,
	timezone?: string,
	agentSessionId?: string,
): string {
	const escapedPrompt = JSON.stringify(fullPrompt);
	const escapedSystemPrompt = JSON.stringify(getSystemPrompt(timezone));
	const escapedModel = JSON.stringify(AGENT_MODEL);
	const escapedTools = JSON.stringify(AGENT_ALLOWED_TOOLS);
	const resumeLine = agentSessionId
		? `        resume: ${JSON.stringify(agentSessionId)},`
		: "";

	return `
import { query } from '@anthropic-ai/claude-agent-sdk';

const prompt = ${escapedPrompt};
const systemPromptAppend = ${escapedSystemPrompt};

async function main() {
  try {
    const generator = query({
      prompt,
      options: {
        cwd: '/vercel/sandbox',
        model: ${escapedModel},
        settingSources: ['project'],
        allowedTools: ${escapedTools},
        permissionMode: 'acceptEdits',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPromptAppend,
        },
        abortController: new AbortController(),
        includePartialMessages: true,
${resumeLine}
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

interface SandboxLineResult {
	message?: SDKMessage;
	error?: string;
	complete?: boolean;
}

function parseSandboxLine(line: string): SandboxLineResult | null {
	if (!line.trim()) return null;

	try {
		const parsed = JSON.parse(line);

		if (parsed.type === "sdk_message") {
			return { message: parsed.data as SDKMessage };
		}
		if (parsed.type === "error") {
			return { error: parsed.error };
		}
		if (parsed.type === "complete") {
			return { complete: true };
		}
		return null;
	} catch {
		if (!line.startsWith("{")) {
			console.log("[Sandbox] Non-JSON output:", line);
		}
		return null;
	}
}

async function* streamViaSandbox({
	prompt,
	chatId,
	conversationHistory = [],
	timezone,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	console.log("[Sandbox] Starting streamViaSandbox");
	const { sandbox, sandboxReused, previousAgentSessionId } =
		await getOrCreateSandbox(chatId);

	const canResume = sandboxReused && !!previousAgentSessionId;
	const effectiveSessionId = canResume ? previousAgentSessionId : undefined;

	if (canResume) {
		console.log(`[Sandbox] Resuming session=${previousAgentSessionId}`);
	} else if (previousAgentSessionId && !sandboxReused) {
		console.log(
			"[Sandbox] Sandbox was recreated, cannot resume previous session",
		);
	}

	try {
		const effectivePrompt = canResume
			? prompt
			: buildFullPrompt(prompt, conversationHistory);
		const script = generateAgentScript(
			effectivePrompt,
			timezone,
			effectiveSessionId,
		);
		console.log("[Sandbox] Writing agent runner script...");

		const envVars: Record<string, string> = {
			ODDS_API_KEY: process.env.ODDS_API_KEY || "",
			API_SPORTS_KEY: process.env.API_SPORTS_KEY || "",
			WEBSHARE_PROXY_URL: process.env.WEBSHARE_PROXY_URL || "",
		};
		const envExports = Object.entries(envVars)
			.filter(([, v]) => v)
			.map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
			.join("\n");

		const configuredKeys = Object.entries(envVars)
			.filter(([, v]) => v)
			.map(([k]) => k);
		console.log(
			`[Sandbox] Writing env vars to .agent-env.sh: ${configuredKeys.join(", ") || "(none)"}`,
		);

		await sandbox.writeFiles([
			{
				path: "/vercel/sandbox/agent-runner.mjs",
				content: Buffer.from(script),
			},
			{
				path: "/vercel/sandbox/.agent-env.sh",
				content: Buffer.from(`#!/bin/bash\n${envExports}\n`),
			},
		]);

		await sandbox.runCommand({
			cmd: "bash",
			args: [
				"-c",
				"grep -q \"agent-env.sh\" /root/.bashrc 2>/dev/null || echo '[ -f /vercel/sandbox/.agent-env.sh ] && source /vercel/sandbox/.agent-env.sh' >> /root/.bashrc",
			],
		});

		console.log("[Sandbox] Verifying Python packages...");
		const verifyResult = await sandbox.runCommand({
			cmd: "bash",
			args: [
				"-c",
				"python3 -c 'import nba_api' 2>/dev/null || (sudo dnf install -y python3 python3-pip 2>/dev/null; sudo pip3 install --break-system-packages -q nba_api requests httpx beautifulsoup4 pandas numpy)",
			],
		});
		if (verifyResult.exitCode !== 0) {
			console.warn("[Sandbox] Warning: Python package verification failed");
		}

		console.log("[Sandbox] Starting agent command...");
		const cmd = await sandbox.runCommand({
			cmd: "node",
			args: ["agent-runner.mjs"],
			env: {
				CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
				BASH_ENV: "/vercel/sandbox/.agent-env.sh",
				...envVars,
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
					const result = parseSandboxLine(line);
					if (!result) continue;
					if (result.error) throw new Error(result.error);
					if (result.message) yield result.message;
					if (result.complete) {
						console.log("[Sandbox] Agent completed successfully");
					}
				}
			} else if (log.stream === "stderr") {
				console.log("[Sandbox] stderr:", log.data);
			}
		}

		if (buffer.trim()) {
			const result = parseSandboxLine(buffer);
			if (result?.error) throw new Error(result.error);
			if (result?.message) yield result.message;
		}

		const exitResult = await cmd.wait();
		console.log(
			"[Sandbox] Command finished with exit code:",
			exitResult.exitCode,
		);

		if (exitResult.exitCode !== 0) {
			throw new Error(`Agent process exited with code ${exitResult.exitCode}`);
		}

		sandbox.extendTimeout(ms("45m")).catch((err: unknown) => {
			console.warn("[Sandbox] Failed to extend timeout (non-fatal):", err);
		});
	} catch (error) {
		console.error("[Sandbox] Error during execution:", error);
		try {
			console.log("[Sandbox] Stopping sandbox due to error...");
			await sandbox.stop();
			await prisma.chat.update({
				where: { id: chatId },
				data: { sandboxId: null, agentSessionId: null },
			});
		} catch (stopError) {
			console.error("[Sandbox] Failed to stop sandbox:", stopError);
		}
		throw error;
	}
}

interface TextBlock {
	type: "text";
	text: string;
}

interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	signature: string;
}

interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | { type: string };

function getAssistantContent(message: SDKMessage): ContentBlock[] | null {
	if (message.type !== "assistant") return null;
	return message.message.content as ContentBlock[];
}

export function extractTextFromMessage(message: SDKMessage): string | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	return content
		.filter((block): block is TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");
}

export function extractToolUseFromMessage(
	message: SDKMessage,
): Array<{ id: string; name: string; input: unknown }> | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	return content
		.filter((block): block is ToolUseBlock => block.type === "tool_use")
		.map(({ id, name, input }) => ({ id, name, input }));
}

export function extractThinkingFromMessage(message: SDKMessage): string | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	const thinkingTexts = content
		.filter((block): block is ThinkingBlock => block.type === "thinking")
		.map((block) => block.thinking);

	return thinkingTexts.length > 0 ? thinkingTexts.join("\n\n") : null;
}
