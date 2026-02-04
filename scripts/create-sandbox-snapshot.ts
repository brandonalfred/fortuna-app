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

	console.log("\nVerifying installation...");
	const verify = await sandbox.runCommand({
		cmd: "node",
		args: ["-e", "require('@anthropic-ai/claude-agent-sdk'); console.log('SDK loaded successfully')"],
	});
	console.log("Verify exit code:", verify.exitCode);
	console.log("Verify output:", await verify.stdout());

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
