import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Sandbox } from "@vercel/sandbox";
import { createLogger } from "@/lib/logger";
import type { Attachment, ConversationMessage } from "@/lib/types";
import { buildContentBlocks } from "./content-blocks";
import { buildFullPrompt } from "./prompt-builder";
import {
	clearSandboxRefs,
	getOrCreateSandbox,
	SANDBOX_SSE_PORT,
	SANDBOX_TIMEOUT,
	type StatusCallback,
} from "./sandbox";
import { writeSSEServerFiles } from "./sandbox-sse-setup";
import {
	AGENT_ALLOWED_TOOLS,
	AGENT_MODEL,
	collectEnvVars,
	getSystemPrompt,
} from "./system-prompt";

const log = createLogger("SandboxRunner");

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
	attachments?: Attachment[];
	onStatus?: StatusCallback;
}

interface AgentScriptOptions {
	fullPrompt: string;
	timezone?: string;
	userFirstName?: string;
	userPreferences?: string;
	agentSessionId?: string;
	envVars?: Record<string, string>;
	attachments?: Attachment[];
}

function generateAgentScript(opts: AgentScriptOptions): string {
	const systemPromptLiteral = JSON.stringify(
		getSystemPrompt(opts.timezone, opts.userFirstName, opts.userPreferences),
	);
	const modelLiteral = JSON.stringify(AGENT_MODEL);
	const toolsLiteral = JSON.stringify(AGENT_ALLOWED_TOOLS);
	const resumeLine = opts.agentSessionId
		? `        resume: ${JSON.stringify(opts.agentSessionId)},`
		: "";

	const envKeys = Object.keys(opts.envVars ?? {});
	const envSetup =
		envKeys.length > 0
			? `\nObject.assign(process.env, ${JSON.stringify(opts.envVars)});\n`
			: "";

	const contentBlocks = buildContentBlocks(opts.fullPrompt, opts.attachments);
	const hasAttachments = contentBlocks.length > 1;

	const promptSetup = hasAttachments
		? `const contentBlocks = JSON.parse(${JSON.stringify(JSON.stringify(contentBlocks))});

async function* promptStream() {
  yield {
    type: "user",
    session_id: "",
    message: { role: "user", content: contentBlocks },
    parent_tool_use_id: null,
  };
}`
		: `const prompt = ${JSON.stringify(opts.fullPrompt)};`;

	const promptArg = hasAttachments ? "promptStream()" : "prompt";

	return `
import { query } from '@anthropic-ai/claude-agent-sdk';
${envSetup}
${promptSetup}
const systemPromptAppend = ${systemPromptLiteral};

async function main() {
  try {
    const generator = query({
      prompt: ${promptArg},
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

type SandboxLineResult =
	| { kind: "message"; message: SDKMessage }
	| { kind: "error"; error: string }
	| { kind: "complete" };

function parseSandboxLine(line: string): SandboxLineResult | null {
	if (!line.trim()) return null;

	try {
		const parsed = JSON.parse(line);
		switch (parsed.type) {
			case "sdk_message":
				return { kind: "message", message: parsed.data as SDKMessage };
			case "error":
				return { kind: "error", error: parsed.error };
			case "complete":
				return { kind: "complete" };
			default:
				return null;
		}
	} catch {
		if (!line.startsWith("{")) {
			log.debug("Non-JSON output", { line });
		}
		return null;
	}
}

function handleSandboxLineResult(result: SandboxLineResult): SDKMessage | null {
	switch (result.kind) {
		case "error":
			throw new Error(result.error);
		case "message":
			return result.message;
		case "complete":
			log.info("Agent completed successfully");
			return null;
	}
}

async function writeSandboxEnvFiles(
	sandbox: Sandbox,
	envVars: Record<string, string>,
): Promise<void> {
	const envEntries = Object.entries(envVars);
	const envExports = envEntries
		.map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
		.join("\n");
	const envPlain = envEntries.map(([k, v]) => `${k}=${v}`).join("\n");

	log.info("Env vars", {
		vars:
			envEntries.length > 0
				? envEntries.map(([k, v]) => `${k}=${v.length}chars`).join(", ")
				: "(none)",
	});

	await sandbox.writeFiles([
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
}

async function verifyPythonPackages(sandbox: Sandbox): Promise<void> {
	const pipFallback = [
		"sudo PIP_BREAK_SYSTEM_PACKAGES=1 pip3 install -q",
		"nba_api requests httpx beautifulsoup4 pandas numpy",
	].join(" ");
	const result = await sandbox.runCommand({
		cmd: "bash",
		args: [
			"-c",
			`python3 -c 'import nba_api' 2>/dev/null || (sudo dnf install -y python3 python3-pip 2>/dev/null; ${pipFallback})`,
		],
	});
	if (result.exitCode !== 0) {
		log.warn("Python package verification failed");
	}
}

const AGENT_ENV_KEYS = ["ODDS_API_KEY", "API_SPORTS_KEY", "WEBSHARE_PROXY_URL"];

interface ResolvedSandbox {
	sandbox: Sandbox;
	canResume: boolean;
	effectiveSessionId: string | undefined;
}

async function resolveSandbox(
	chatId: string,
	onStatus?: StatusCallback,
): Promise<ResolvedSandbox> {
	const { sandbox, sandboxReused, previousAgentSessionId } =
		await getOrCreateSandbox(chatId, onStatus);

	const canResume = sandboxReused && !!previousAgentSessionId;

	if (canResume) {
		log.info("Resuming session", { sessionId: previousAgentSessionId });
	} else if (previousAgentSessionId && !sandboxReused) {
		log.info("Sandbox was recreated, cannot resume previous session");
	}

	return {
		sandbox,
		canResume,
		effectiveSessionId: canResume ? previousAgentSessionId! : undefined,
	};
}

export async function* streamViaSandbox({
	prompt,
	chatId,
	conversationHistory = [],
	timezone,
	userFirstName,
	userPreferences,
	attachments,
	onStatus,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	log.info("Starting streamViaSandbox");
	const { sandbox, canResume, effectiveSessionId } = await resolveSandbox(
		chatId,
		onStatus,
	);

	try {
		const effectivePrompt = canResume
			? prompt
			: buildFullPrompt(prompt, conversationHistory);

		const envVars = collectEnvVars(AGENT_ENV_KEYS);

		const script = generateAgentScript({
			fullPrompt: effectivePrompt,
			timezone,
			userFirstName,
			userPreferences,
			agentSessionId: effectiveSessionId,
			envVars,
			attachments,
		});

		await writeSandboxEnvFiles(sandbox, envVars);

		log.debug("Writing agent runner script...");
		await sandbox.writeFiles([
			{
				path: "/vercel/sandbox/agent-runner.mjs",
				content: Buffer.from(script),
			},
		]);

		await verifyPythonPackages(sandbox);

		onStatus?.("starting", "Starting analysis...");
		log.info("Starting agent command...");
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

		for await (const entry of cmd.logs()) {
			if (entry.stream === "stdout") {
				buffer += entry.data;

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const result = parseSandboxLine(line);
					if (!result) continue;
					const message = handleSandboxLineResult(result);
					if (message) yield message;
				}
			} else if (entry.stream === "stderr") {
				log.debug("stderr", { data: entry.data });
			}
		}

		if (buffer.trim()) {
			const result = parseSandboxLine(buffer);
			if (result) {
				const message = handleSandboxLineResult(result);
				if (message) yield message;
			}
		}

		const exitResult = await cmd.wait();
		log.info("Command finished", { exitCode: exitResult.exitCode });

		if (exitResult.exitCode !== 0) {
			throw new Error(`Agent process exited with code ${exitResult.exitCode}`);
		}

		sandbox.extendTimeout(SANDBOX_TIMEOUT).catch((err: unknown) => {
			log.warn(
				"Failed to extend timeout, will create fresh sandbox next request",
				{
					error: err instanceof Error ? err.message : String(err),
				},
			);
			clearSandboxRefs(chatId).catch((dbErr) =>
				log.error(
					"Failed to clear sandbox refs after timeout extension failure",
					dbErr,
				),
			);
		});
	} catch (error) {
		log.error("Error during execution", error);
		try {
			log.info("Stopping sandbox due to error...");
			await sandbox.stop();
			await clearSandboxRefs(chatId);
		} catch (stopError) {
			log.error("Failed to stop sandbox", stopError);
		}
		throw error;
	}
}

// --- Direct Streaming Functions ---

export interface DirectStreamOptions extends StreamAgentOptions {
	persistUrl: string;
	streamToken: string;
	persistToken: string;
	initialSequenceNum: number;
	protectionBypassSecret?: string;
}

async function waitForSSEServer(
	streamUrl: string,
	timeoutMs = 15000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${streamUrl}/health`, {
				signal: AbortSignal.timeout(2000),
			});
			if (res.ok) return;
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error("SSE server failed to start within timeout");
}

export async function setupDirectStream(
	options: DirectStreamOptions,
): Promise<{ streamUrl: string }> {
	const {
		prompt,
		chatId,
		conversationHistory = [],
		timezone,
		userFirstName,
		userPreferences,
		onStatus,
		persistUrl,
		streamToken,
		persistToken,
		initialSequenceNum,
		protectionBypassSecret,
	} = options;

	log.info("Setting up direct stream", { chatId });

	const { sandbox, canResume, effectiveSessionId } = await resolveSandbox(
		chatId,
		onStatus,
	);

	await sandbox.runCommand({
		cmd: "bash",
		args: ["-c", "pkill -f sandbox-sse-server || true"],
	});
	await new Promise((r) => setTimeout(r, 500));

	const effectivePrompt = canResume
		? prompt
		: buildFullPrompt(prompt, conversationHistory);

	const envVars = collectEnvVars(AGENT_ENV_KEYS);
	await writeSandboxEnvFiles(sandbox, envVars);

	await writeSSEServerFiles(sandbox, {
		streamToken,
		persistToken,
		persistUrl,
		chatId,
		port: SANDBOX_SSE_PORT,
		initialPrompt: effectivePrompt,
		systemPrompt: getSystemPrompt(timezone, userFirstName, userPreferences),
		model: AGENT_MODEL,
		allowedTools: AGENT_ALLOWED_TOOLS,
		agentSessionId: effectiveSessionId ?? null,
		maxThinkingTokens: 10000,
		initialSequenceNum,
		protectionBypassSecret: protectionBypassSecret ?? null,
	});

	await verifyPythonPackages(sandbox);

	onStatus?.("starting", "Starting analysis...");
	log.info("Starting SSE server...");

	await sandbox.runCommand({
		cmd: "node",
		args: ["sandbox-sse-server.mjs"],
		env: {
			CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
			BASH_ENV: "/vercel/sandbox/.agent-env.sh",
			...envVars,
		},
		detached: true,
	});

	let streamUrl: string;
	try {
		streamUrl = sandbox.domain(SANDBOX_SSE_PORT);
	} catch {
		log.warn("sandbox.domain() failed — sandbox may lack port config");
		throw new Error(
			"Sandbox does not support port exposure, force-create needed",
		);
	}

	await waitForSSEServer(streamUrl);
	log.info("SSE server ready", { streamUrl });

	return { streamUrl };
}

export async function sendMessageToSSE(options: {
	sandboxId: string;
	streamToken: string;
	prompt: string;
}): Promise<{ streamUrl: string }> {
	const { sandboxId, streamToken: token, prompt } = options;
	log.info("Sending message to existing SSE server", { sandboxId });

	const sandbox = await Sandbox.get({ sandboxId });
	const streamUrl = sandbox.domain(SANDBOX_SSE_PORT);

	const res = await fetch(`${streamUrl}/message`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ prompt }),
		signal: AbortSignal.timeout(5000),
	});

	if (!res.ok) {
		throw new Error(`SSE server /message failed: ${res.status}`);
	}

	return { streamUrl };
}
