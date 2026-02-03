import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Vercel serverless has read-only filesystem except /tmp
const WORKSPACE_ROOT = process.env.VERCEL
	? "/tmp/workspace"
	: process.env.WORKSPACE_ROOT || "./workspace";

function resolveWorkspaceRoot(): string {
	if (path.isAbsolute(WORKSPACE_ROOT)) {
		return WORKSPACE_ROOT;
	}
	return path.join(process.cwd(), WORKSPACE_ROOT);
}

export async function getOrCreateWorkspace(sessionId: string): Promise<string> {
	const workspacePath = path.join(resolveWorkspaceRoot(), sessionId);
	await mkdir(workspacePath, { recursive: true });
	return workspacePath;
}

export async function cleanupOldWorkspaces(maxAgeDays = 7): Promise<void> {
	const workspaceRoot = resolveWorkspaceRoot();
	const maxAgeMs = maxAgeDays * MS_PER_DAY;
	const now = Date.now();

	let entries: string[];
	try {
		entries = await readdir(workspaceRoot);
	} catch {
		return;
	}

	for (const entry of entries) {
		const entryPath = path.join(workspaceRoot, entry);
		const stats = await stat(entryPath);

		if (stats.isDirectory() && now - stats.mtimeMs > maxAgeMs) {
			await rm(entryPath, { recursive: true, force: true });
		}
	}
}
