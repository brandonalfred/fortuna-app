import fs from "node:fs";
import path from "node:path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
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
	if (process.env.VERCEL) {
		yield* streamViaSandbox(options);
	} else {
		yield* streamLocal(options);
	}
}

async function* streamLocal({
	prompt,
	workspacePath,
	conversationHistory = [],
	abortController = new AbortController(),
	timezone,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	console.log("[Agent] streamLocal called");
	const fullPrompt = buildFullPrompt(prompt, conversationHistory);
	const cliPath = getClaudeCodeCliPath();

	yield* query({
		prompt: fullPrompt,
		options: {
			cwd: workspacePath,
			model: AGENT_MODEL,
			pathToClaudeCodeExecutable: cliPath,
			settingSources: ["project"],
			allowedTools: AGENT_ALLOWED_TOOLS,
			permissionMode: "acceptEdits",
			systemPrompt: {
				type: "preset",
				preset: "claude_code",
				append: getSystemPrompt(timezone),
			},
			abortController,
			includePartialMessages: true,
		},
	});
}

async function runSandboxCommand(
	sandbox: Sandbox,
	options: { cmd: string; args: string[] },
	description: string,
	opts?: { warnOnly?: boolean },
): Promise<void> {
	console.log(`[Sandbox] ${description}...`);
	const result = await sandbox.runCommand(options);
	if (result.exitCode !== 0) {
		const message = `${description} failed (exit code ${result.exitCode})`;
		if (opts?.warnOnly) {
			console.warn(`[Sandbox] Warning: ${message}`);
		} else {
			throw new Error(message);
		}
	}
}

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
					[
						"apt-get update",
						"apt-get install -y python3 python3-pip python3-venv jq sqlite3 csvkit libxml2-dev libxslt1-dev",
					].join(" && "),
				],
			},
			"Installing Python 3, pip, and system tools",
			{ warnOnly: true },
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
			},
			"Installing Python packages",
			{ warnOnly: true },
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
		data: { sandboxId: sandbox.sandboxId },
	});

	return sandbox;
}

function generateAgentScript(fullPrompt: string, timezone?: string): string {
	const escapedPrompt = JSON.stringify(fullPrompt);
	const escapedSystemPrompt = JSON.stringify(getSystemPrompt(timezone));
	const escapedModel = JSON.stringify(AGENT_MODEL);
	const escapedTools = JSON.stringify(AGENT_ALLOWED_TOOLS);

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
	} catch (parseError) {
		if (!(parseError instanceof SyntaxError)) {
			throw parseError;
		}
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
	const sandbox = await getOrCreateSandbox(chatId);

	try {
		const fullPrompt = buildFullPrompt(prompt, conversationHistory);
		const script = generateAgentScript(fullPrompt, timezone);
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
				"python3 -c 'import nba_api' 2>/dev/null || pip3 install --break-system-packages -q nba_api requests httpx beautifulsoup4 pandas numpy",
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

		console.log("[Sandbox] Extending sandbox timeout...");
		sandbox.extendTimeout(ms("45m")).catch((extendError: unknown) => {
			console.warn(
				"[Sandbox] Failed to extend timeout (non-fatal):",
				extendError instanceof Error ? extendError.message : extendError,
			);
		});
	} catch (error) {
		console.error("[Sandbox] Error during execution:", error);
		try {
			console.log("[Sandbox] Stopping sandbox due to error...");
			await sandbox.stop();
			await prisma.chat.update({
				where: { id: chatId },
				data: { sandboxId: null },
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
	if (message.type !== "assistant") {
		return null;
	}
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
