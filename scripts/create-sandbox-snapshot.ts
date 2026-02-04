import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

async function createSnapshot() {
	console.log("Creating sandbox...");
	const sandbox = await Sandbox.create({
		runtime: "node22",
		resources: { vcpus: 4 },
		timeout: ms("45m"),
	});

	console.log("Sandbox created:", sandbox.sandboxId);

	console.log("\nInstalling Claude Code CLI (native installer)...");
	const cliInstall = await sandbox.runCommand({
		cmd: "bash",
		args: ["-c", "curl -fsSL https://claude.ai/install.sh | bash"],
	});
	console.log("CLI install exit code:", cliInstall.exitCode);
	console.log("CLI stdout:", await cliInstall.stdout());
	if (cliInstall.exitCode !== 0) {
		console.error("CLI stderr:", await cliInstall.stderr());
		throw new Error("Failed to install Claude Code CLI");
	}

	console.log("\nInstalling SDKs...");
	const sdkInstall = await sandbox.runCommand({
		cmd: "npm",
		args: ["install", "@anthropic-ai/claude-agent-sdk", "@anthropic-ai/sdk"],
	});
	console.log("SDK install exit code:", sdkInstall.exitCode);
	console.log("SDK stdout:", await sdkInstall.stdout());
	if (sdkInstall.exitCode !== 0) {
		console.error("SDK stderr:", await sdkInstall.stderr());
		throw new Error("Failed to install SDKs");
	}

	console.log("\nInstalling Python 3, pip, and system tools...");
	const aptInstall = await sandbox.runCommand({
		cmd: "bash",
		args: [
			"-c",
			[
				"apt-get update",
				"apt-get install -y",
				"python3 python3-pip python3-venv",
				"jq sqlite3 csvkit",
				"libxml2-dev libxslt1-dev",
			].join(" && "),
		],
	});
	console.log("apt install exit code:", aptInstall.exitCode);
	if (aptInstall.exitCode !== 0) {
		console.error("apt stderr:", await aptInstall.stderr());
		throw new Error("Failed to install system packages");
	}

	console.log("\nInstalling Python packages...");
	const pipInstall = await sandbox.runCommand({
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
			].join(" "),
		],
	});
	console.log("pip install exit code:", pipInstall.exitCode);
	if (pipInstall.exitCode !== 0) {
		console.error("pip stderr:", await pipInstall.stderr());
		throw new Error("Failed to install Python packages");
	}

	console.log("\nVerifying installations...");
	const verifyNode = await sandbox.runCommand({
		cmd: "node",
		args: [
			"-e",
			"require('@anthropic-ai/claude-agent-sdk'); console.log('SDK loaded successfully')",
		],
	});
	console.log("Node SDK verify:", verifyNode.exitCode === 0 ? "✓" : "✗");

	const verifyPython = await sandbox.runCommand({
		cmd: "python3",
		args: ["-c", "import pandas, numpy, scipy, duckdb; print('Python packages loaded successfully')"],
	});
	console.log("Python verify:", verifyPython.exitCode === 0 ? "✓" : "✗");
	console.log("Python output:", await verifyPython.stdout());

	console.log("\nCreating snapshot (this will stop the sandbox)...");
	const snapshot = await sandbox.snapshot();

	console.log("\n✓ Snapshot created successfully!");
	console.log("Snapshot ID:", snapshot.snapshotId);
	console.log("\nAdd this to your Vercel environment variables:");
	console.log(`AGENT_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
	console.log("\nNote: Snapshots expire after 7 days. Run this script again to refresh.");
}

createSnapshot().catch((error) => {
	console.error("Failed to create snapshot:", error);
	process.exit(1);
});
