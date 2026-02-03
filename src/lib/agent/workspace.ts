import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "./workspace";

export async function getOrCreateWorkspace(sessionId: string): Promise<string> {
	const workspacePath = path.join(process.cwd(), WORKSPACE_ROOT, sessionId);
	await mkdir(workspacePath, { recursive: true });
	return workspacePath;
}

export async function cleanupOldWorkspaces(maxAgeDays = 7): Promise<void> {
	const workspaceRoot = path.join(process.cwd(), WORKSPACE_ROOT);

	try {
		const entries = await readdir(workspaceRoot);
		const now = Date.now();
		const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

		for (const entry of entries) {
			const entryPath = path.join(workspaceRoot, entry);
			const stats = await stat(entryPath);

			if (stats.isDirectory() && now - stats.mtimeMs > maxAgeMs) {
				await rm(entryPath, { recursive: true, force: true });
			}
		}
	} catch {
		// Workspace root doesn't exist yet
	}
}
