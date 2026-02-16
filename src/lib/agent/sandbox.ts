import { Sandbox } from "@vercel/sandbox";
import ms from "ms";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getSkillFiles } from "./system-prompt";

const log = createLogger("Sandbox");

export const SANDBOX_TIMEOUT = ms("5h");

const SPAWN_LOCK_TIMEOUT = ms("2m");
const SPAWN_POLL_INTERVAL = 1000;

export type StatusCallback = (stage: string, message: string) => void;

export interface SandboxResult {
	sandbox: Sandbox;
	sandboxReused: boolean;
	previousAgentSessionId: string | null;
}

async function runSandboxCommand(
	sandbox: Sandbox,
	options: { cmd: string; args: string[]; sudo?: boolean },
	description: string,
): Promise<void> {
	log.info(`${description}...`);
	const result = await sandbox.runCommand(options);
	if (result.exitCode !== 0) {
		const stderr = await result.stderr();
		throw new Error(
			`${description} failed (exit code ${result.exitCode}): ${stderr}`,
		);
	}
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
		log.warn("Snapshot unavailable, falling back to fresh sandbox", {
			snapshotId,
			error: error instanceof Error ? error.message : String(error),
		});
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

export async function clearSandboxRefs(chatId: string): Promise<void> {
	await prisma.chat.update({
		where: { id: chatId },
		data: { sandboxId: null, agentSessionId: null },
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

export async function getOrCreateSandbox(
	chatId: string,
	onStatus?: StatusCallback,
): Promise<SandboxResult> {
	onStatus?.("preparing", "Preparing workspace...");
	const chat = await prisma.chat.findUnique({ where: { id: chatId } });
	const previousAgentSessionId = chat?.agentSessionId ?? null;

	if (chat?.sandboxId) {
		try {
			const existing = await Sandbox.get({ sandboxId: chat.sandboxId });
			log.info("Reusing existing sandbox", { sandboxId: chat.sandboxId });
			return {
				sandbox: existing,
				sandboxReused: true,
				previousAgentSessionId,
			};
		} catch (error) {
			log.info("Existing sandbox expired or unavailable", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const acquired = await acquireSpawnLock(chatId);
	if (!acquired) {
		log.info("Another request is spawning, waiting for sandbox...");
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
		log.info("Creating new sandbox", {
			source: snapshotId ? `snapshot:${snapshotId}` : "fresh",
		});

		onStatus?.("initializing", "Initializing environment...");
		const { sandbox, usedSnapshot } = await createSandbox(snapshotId, onStatus);
		log.info("Created new sandbox", { sandboxId: sandbox.sandboxId });

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
		log.info(`Setting up ${skills.length} skills...`);

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
			log.debug(`Copied skill: ${skill.name}`);
		}

		await releaseSpawnLock(chatId, sandbox.sandboxId);

		return { sandbox, sandboxReused: false, previousAgentSessionId: null };
	} catch (error) {
		await clearSpawnLock(chatId).catch((e) =>
			log.error("Failed to clear spawn lock", e),
		);
		throw error;
	}
}
