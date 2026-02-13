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
import type {
	ConversationMessage,
	ConversationToolResult,
	ConversationToolUse,
} from "@/lib/types";

const DEFAULT_TIMEZONE = "America/New_York";

const SANDBOX_TIMEOUT = ms("5h");

const SPAWN_LOCK_TIMEOUT = ms("2m");
const SPAWN_POLL_INTERVAL = 1000;

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

function collectEnvVars(keys: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (const key of keys) {
		const value = process.env[key];
		if (value) {
			result[key] = value;
		}
	}
	return result;
}

function sanitizeName(name: string): string {
	return name
		.replace(/[^\p{L}\p{N}\s'-]/gu, "")
		.trim()
		.slice(0, 50);
}

function getSystemPrompt(
	timezone?: string,
	userFirstName?: string,
	userPreferences?: string,
): string {
	const promptPath = path.join(process.cwd(), "src/lib/agent/system-prompt.md");
	const basePrompt = fs.readFileSync(promptPath, "utf-8");

	const currentDate = formatCurrentDate(timezone || DEFAULT_TIMEZONE);
	const dateContext = `\n\nIMPORTANT: Today's date is ${currentDate}. Use this as the reference for "today", "yesterday", "tomorrow", etc.\n`;

	const safeName = userFirstName ? sanitizeName(userFirstName) : "";
	const userContext = safeName
		? `\n\nThe user's name is ${safeName}. Use their name naturally and sparingly — in greetings and occasionally when it feels conversational. Don't use it in every message.\n`
		: "";

	const preferencesContext = userPreferences
		? `\n\nUSER PREFERENCES:\nThe user has set the following personal preferences. Respect these throughout every interaction:\n${userPreferences}\n`
		: "";

	return basePrompt + dateContext + userContext + preferencesContext;
}

function getSkillFiles(): Array<{ name: string; content: string }> {
	const skillsDir = path.join(process.cwd(), ".claude/skills");
	if (!fs.existsSync(skillsDir)) return [];

	const skills: Array<{ name: string; content: string }> = [];
	for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
		if (!fs.existsSync(skillPath)) continue;
		skills.push({
			name: entry.name,
			content: fs.readFileSync(skillPath, "utf-8"),
		});
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

type StatusCallback = (stage: string, message: string) => void;

export interface StreamAgentOptions {
	prompt: string;
	workspacePath: string;
	chatId: string;
	conversationHistory?: ConversationMessage[];
	abortController?: AbortController;
	timezone?: string;
	userFirstName?: string;
	userPreferences?: string;
	agentSessionId?: string;
	onStatus?: StatusCallback;
}

const MAX_TOOL_RESULT_PROMPT_LIMIT = 500;

function summarizeToolInput(input: unknown): string {
	if (typeof input === "string") {
		return input.length > 50 ? input.slice(0, 50) : input;
	}
	if (input && typeof input === "object") {
		const obj = input as Record<string, unknown>;
		if (typeof obj.query === "string") return obj.query;
		if (typeof obj.name === "string") return obj.name;
	}
	return "";
}

function formatToolsWithResults(
	tools: ConversationToolUse[],
	toolResults?: ConversationToolResult[],
): string {
	const resultMap = new Map(toolResults?.map((r) => [r.toolUseId, r]) ?? []);

	return tools
		.map((t) => {
			const summary = summarizeToolInput(t.input);
			const label = summary ? `${t.name}("${summary}")` : t.name;
			const result = t.toolUseId ? resultMap.get(t.toolUseId) : undefined;
			if (!result) return `[Tool: ${label}]`;

			let content = result.content;
			if (content.length > MAX_TOOL_RESULT_PROMPT_LIMIT) {
				content = `${content.slice(0, MAX_TOOL_RESULT_PROMPT_LIMIT)}...[truncated]`;
			}
			const prefix = result.isError ? " ERROR:" : "";
			return `[Tool: ${label}]${prefix} → ${content}`;
		})
		.join("\n");
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
			const toolsPart =
				msg.tools && msg.tools.length > 0
					? `\n${formatToolsWithResults(msg.tools, msg.toolResults)}`
					: "";
			return `${thinkingPart}Assistant: ${msg.content}${toolsPart}`;
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

function buildQueryOptions(opts: {
	workspacePath: string;
	abortController: AbortController;
	timezone?: string;
	userFirstName?: string;
	userPreferences?: string;
	agentSessionId?: string;
}) {
	return {
		cwd: opts.workspacePath,
		model: AGENT_MODEL,
		pathToClaudeCodeExecutable: getClaudeCodeCliPath(),
		settingSources: ["project"] satisfies SettingSource[],
		allowedTools: AGENT_ALLOWED_TOOLS,
		permissionMode: "acceptEdits" as const,
		systemPrompt: {
			type: "preset" as const,
			preset: "claude_code" as const,
			append: getSystemPrompt(
				opts.timezone,
				opts.userFirstName,
				opts.userPreferences,
			),
		},
		abortController: opts.abortController,
		includePartialMessages: true,
		maxThinkingTokens: 10000,
		resume: opts.agentSessionId,
	};
}

export function createLocalAgentQuery({
	prompt,
	workspacePath,
	conversationHistory = [],
	abortController = new AbortController(),
	timezone,
	userFirstName,
	userPreferences,
	agentSessionId,
}: StreamAgentOptions): Query {
	const effectivePrompt = agentSessionId
		? prompt
		: buildFullPrompt(prompt, conversationHistory);

	return query({
		prompt: singleMessageStream(effectivePrompt),
		options: buildQueryOptions({
			workspacePath,
			abortController,
			timezone,
			userFirstName,
			userPreferences,
			agentSessionId,
		}),
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
		const stderr = await result.stderr();
		throw new Error(
			`${description} failed (exit code ${result.exitCode}): ${stderr}`,
		);
	}
}

interface SandboxResult {
	sandbox: Sandbox;
	sandboxReused: boolean;
	previousAgentSessionId: string | null;
}

async function createFreshSandbox(): Promise<Sandbox> {
	return Sandbox.create({
		runtime: "node22",
		resources: { vcpus: 4 },
		timeout: SANDBOX_TIMEOUT,
	});
}

async function createSandbox(
	snapshotId: string | undefined,
	onStatus?: StatusCallback,
): Promise<{ sandbox: Sandbox; usedSnapshot: boolean }> {
	if (!snapshotId) {
		return { sandbox: await createFreshSandbox(), usedSnapshot: false };
	}

	try {
		const sandbox = await Sandbox.create({
			source: { type: "snapshot", snapshotId },
			resources: { vcpus: 4 },
			timeout: SANDBOX_TIMEOUT,
		});
		return { sandbox, usedSnapshot: true };
	} catch (error) {
		console.warn(
			"[Sandbox] Snapshot unavailable, falling back to fresh sandbox:",
			error instanceof Error ? error.message : error,
		);
		onStatus?.(
			"installing",
			"Setting up fresh environment (this may take a moment)...",
		);
		return { sandbox: await createFreshSandbox(), usedSnapshot: false };
	}
}

async function acquireSpawnLock(chatId: string): Promise<boolean> {
	const staleThreshold = new Date(Date.now() - SPAWN_LOCK_TIMEOUT);
	const result = await prisma.chat.updateMany({
		where: {
			id: chatId,
			OR: [
				{ executorStatus: null },
				{ executorStatus: "spawning", updatedAt: { lt: staleThreshold } },
			],
		},
		data: { executorStatus: "spawning" },
	});
	return result.count > 0;
}

async function releaseSpawnLock(
	chatId: string,
	sandboxId: string,
): Promise<void> {
	await prisma.chat.update({
		where: { id: chatId },
		data: { executorStatus: null, sandboxId, agentSessionId: null },
	});
}

async function clearSpawnLock(chatId: string): Promise<void> {
	await prisma.chat.update({
		where: { id: chatId },
		data: { executorStatus: null, sandboxId: null, agentSessionId: null },
	});
}

async function waitForSandbox(chatId: string): Promise<string> {
	const deadline = Date.now() + SPAWN_LOCK_TIMEOUT;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, SPAWN_POLL_INTERVAL));
		const chat = await prisma.chat.findUnique({ where: { id: chatId } });
		if (chat?.sandboxId && !chat.executorStatus) return chat.sandboxId;
		if (!chat?.executorStatus) break;
	}
	throw new Error("Timed out waiting for sandbox to be created");
}

async function getOrCreateSandbox(
	chatId: string,
	onStatus?: StatusCallback,
): Promise<SandboxResult> {
	onStatus?.("preparing", "Preparing workspace...");
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

	const acquired = await acquireSpawnLock(chatId);
	if (!acquired) {
		console.log(
			"[Sandbox] Another request is spawning, waiting for sandbox...",
		);
		onStatus?.("preparing", "Another request is setting up the environment...");
		const sandboxId = await waitForSandbox(chatId);
		const sandbox = await Sandbox.get({ sandboxId });
		const refreshed = await prisma.chat.findUnique({
			where: { id: chatId },
		});
		return {
			sandbox,
			sandboxReused: true,
			previousAgentSessionId: refreshed?.agentSessionId ?? null,
		};
	}

	try {
		const snapshotId =
			process.env.AGENT_SANDBOX_SNAPSHOT_ID?.trim() || undefined;
		console.log(
			"[Sandbox] Creating new sandbox",
			snapshotId ? `from snapshot: ${snapshotId}` : "(no snapshot)",
		);

		onStatus?.("initializing", "Initializing environment...");
		const { sandbox, usedSnapshot } = await createSandbox(snapshotId, onStatus);
		console.log("[Sandbox] Created new sandbox:", sandbox.sandboxId);

		if (!usedSnapshot) {
			onStatus?.(
				"installing",
				"Setting up fresh environment (this may take a moment)...",
			);

			onStatus?.("installing", "Installing core tools (1/4)...");
			await runSandboxCommand(
				sandbox,
				{
					cmd: "bash",
					args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
				},
				"Installing Claude Code CLI",
			);

			onStatus?.("installing", "Installing SDKs (2/4)...");
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

			onStatus?.("installing", "Installing system tools (3/4)...");
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

			onStatus?.("installing", "Installing analysis packages (4/4)...");
			await runSandboxCommand(
				sandbox,
				{
					cmd: "bash",
					args: [
						"-c",
						[
							"PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install",
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

		onStatus?.("configuring", "Configuring tools...");
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

		await releaseSpawnLock(chatId, sandbox.sandboxId);

		return { sandbox, sandboxReused: false, previousAgentSessionId: null };
	} catch (error) {
		await clearSpawnLock(chatId).catch((e) =>
			console.error("[Sandbox] Failed to clear spawn lock:", e),
		);
		throw error;
	}
}

function generateAgentScript(opts: {
	fullPrompt: string;
	timezone?: string;
	userFirstName?: string;
	userPreferences?: string;
	agentSessionId?: string;
	envVars?: Record<string, string>;
}): string {
	const promptLiteral = JSON.stringify(opts.fullPrompt);
	const systemPromptLiteral = JSON.stringify(
		getSystemPrompt(opts.timezone, opts.userFirstName, opts.userPreferences),
	);
	const modelLiteral = JSON.stringify(AGENT_MODEL);
	const toolsLiteral = JSON.stringify(AGENT_ALLOWED_TOOLS);
	const resumeLine = opts.agentSessionId
		? `        resume: ${JSON.stringify(opts.agentSessionId)},`
		: "";

	const hasEnvVars = opts.envVars && Object.keys(opts.envVars).length > 0;
	const envSetup = hasEnvVars
		? `\nObject.assign(process.env, ${JSON.stringify(opts.envVars)});\n`
		: "";

	return `
import { query } from '@anthropic-ai/claude-agent-sdk';
${envSetup}
const prompt = ${promptLiteral};
const systemPromptAppend = ${systemPromptLiteral};

async function main() {
  try {
    const generator = query({
      prompt,
      options: {
        cwd: '/vercel/sandbox',
        model: ${modelLiteral},
        settingSources: ['project'],
        allowedTools: ${toolsLiteral},
        permissionMode: 'acceptEdits',
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPromptAppend,
        },
        env: process.env,
        abortController: new AbortController(),
        includePartialMessages: true,
        maxThinkingTokens: 10000,
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
		switch (parsed.type) {
			case "sdk_message":
				return { message: parsed.data as SDKMessage };
			case "error":
				return { error: parsed.error };
			case "complete":
				return { complete: true };
			default:
				return null;
		}
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
	userFirstName,
	userPreferences,
	onStatus,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	console.log("[Sandbox] Starting streamViaSandbox");
	const { sandbox, sandboxReused, previousAgentSessionId } =
		await getOrCreateSandbox(chatId, onStatus);

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

		const envVars = collectEnvVars([
			"ODDS_API_KEY",
			"API_SPORTS_KEY",
			"WEBSHARE_PROXY_URL",
		]);

		const script = generateAgentScript({
			fullPrompt: effectivePrompt,
			timezone,
			userFirstName,
			userPreferences,
			agentSessionId: effectiveSessionId,
			envVars,
		});

		const envEntries = Object.entries(envVars);
		const envExports = envEntries
			.map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
			.join("\n");
		const envPlain = envEntries.map(([k, v]) => `${k}=${v}`).join("\n");

		console.log(
			`[Sandbox] Env vars: ${envEntries.map(([k, v]) => `${k}=${v.length}chars`).join(", ") || "(none)"}`,
		);

		console.log("[Sandbox] Writing agent runner script...");
		await sandbox.writeFiles([
			{
				path: "/vercel/sandbox/agent-runner.mjs",
				content: Buffer.from(script),
			},
			{
				path: "/vercel/sandbox/.agent-env.sh",
				content: Buffer.from(`#!/bin/bash\n${envExports}\n`),
			},
			{
				path: "/vercel/sandbox/.agent-env",
				content: Buffer.from(`${envPlain}\n`),
			},
		]);

		const agentEnvSource =
			"[ -f /vercel/sandbox/.agent-env.sh ] && . /vercel/sandbox/.agent-env.sh";
		await sandbox.runCommand({
			cmd: "bash",
			args: [
				"-c",
				[
					`for f in /etc/bashrc /etc/bash.bashrc; do [ -f "$f" ] && ! grep -q agent-env "$f" && echo '${agentEnvSource}' >> "$f"; done`,
					`cp /vercel/sandbox/.agent-env.sh /etc/profile.d/agent-env.sh 2>/dev/null || true`,
					`grep -q agent-env /root/.bashrc 2>/dev/null || echo '${agentEnvSource}' >> /root/.bashrc`,
				].join(" ; "),
			],
		});

		console.log("[Sandbox] Verifying Python packages...");
		const pipFallback = [
			"sudo PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install -q",
			"nba_api requests httpx beautifulsoup4 pandas numpy",
		].join(" ");
		const verifyResult = await sandbox.runCommand({
			cmd: "bash",
			args: [
				"-c",
				`python3 -c 'import nba_api' 2>/dev/null || (sudo dnf install -y python3 python3-pip 2>/dev/null; ${pipFallback})`,
			],
		});
		if (verifyResult.exitCode !== 0) {
			console.warn("[Sandbox] Warning: Python package verification failed");
		}

		onStatus?.("starting", "Starting analysis...");
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

		sandbox.extendTimeout(SANDBOX_TIMEOUT).catch((err: unknown) => {
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

interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	signature: string;
}

type ContentBlock = ThinkingBlock | { type: string };

function getAssistantContent(message: SDKMessage): ContentBlock[] | null {
	if (message.type !== "assistant") return null;
	return message.message.content as ContentBlock[];
}

export function extractThinkingFromMessage(message: SDKMessage): string | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	const thinkingTexts = content
		.filter((block): block is ThinkingBlock => block.type === "thinking")
		.map((block) => block.thinking);

	return thinkingTexts.length > 0 ? thinkingTexts.join("\n\n") : null;
}
