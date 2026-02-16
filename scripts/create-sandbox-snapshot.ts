import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

async function runStep(
	sandbox: Sandbox,
	description: string,
	options: { cmd: string; args: string[]; sudo?: boolean },
): Promise<void> {
	console.log(`\n${description}...`);
	const result = await sandbox.runCommand(options);
	console.log(`Exit code: ${result.exitCode}`);

	if (result.exitCode !== 0) {
		const stderr = await result.stderr();
		throw new Error(
			`${description} failed (exit code ${result.exitCode}): ${stderr}`,
		);
	}
}

async function createSnapshot(): Promise<void> {
	const token = process.env.VERCEL_TOKEN;
	const teamId = process.env.VERCEL_ORG_ID;
	const projectId = process.env.VERCEL_PROJECT_ID;

	console.log("Creating sandbox...");
	const sandbox = await Sandbox.create({
		runtime: "node22",
		resources: { vcpus: 4 },
		timeout: ms("45m"),
		...(token && teamId && projectId ? { token, teamId, projectId } : {}),
	});

	console.log("Sandbox created:", sandbox.sandboxId);

	await runStep(sandbox, "Installing Claude Code CLI (native installer)", {
		cmd: "bash",
		args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
	});

	await runStep(sandbox, "Installing SDKs", {
		cmd: "npm",
		args: ["install", "@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk"],
	});

	await runStep(
		sandbox,
		"Installing Python 3, pip, and system tools",
		{
			cmd: "bash",
			args: [
				"-c",
				"dnf install -y python3 python3-pip python3-devel jq sqlite libxml2-devel libxslt-devel",
			],
			sudo: true,
		},
	);

	await runStep(sandbox, "Installing Python packages", {
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
	});

	console.log("\nVerifying installations...");
	const verifyNode = await sandbox.runCommand({
		cmd: "node",
		args: [
			"-e",
			"require('@anthropic-ai/claude-agent-sdk'); console.log('SDK loaded successfully')",
		],
	});
	console.log("Node SDK verify:", verifyNode.exitCode === 0 ? "OK" : "FAIL");

	const verifyPython = await sandbox.runCommand({
		cmd: "python3",
		args: [
			"-c",
			"import pandas, numpy, scipy, duckdb; print('Python packages loaded successfully')",
		],
	});
	console.log(
		"Python verify:",
		verifyPython.exitCode === 0 ? "OK" : "FAIL",
	);
	console.log("Python output:", await verifyPython.stdout());

	console.log("\nCreating snapshot (this will stop the sandbox)...");
	const snapshot = await sandbox.snapshot();

	console.log("\nSnapshot created successfully!");
	console.log("Snapshot ID:", snapshot.snapshotId);
	console.log("\nAdd this to your Vercel environment variables:");
	console.log(`AGENT_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
	console.log(
		"\nNote: Snapshots expire after 7 days. Run this script again to refresh.",
	);
}

createSnapshot().catch((error) => {
	console.error("Failed to create snapshot:", error);
	process.exit(1);
});
