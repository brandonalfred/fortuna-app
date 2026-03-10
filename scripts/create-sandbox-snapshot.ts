import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

async function runStep(
	sandbox: Sandbox,
	description: string,
	options: { cmd: string; args: string[]; sudo?: boolean },
): Promise<void> {
	const start = Date.now();
	console.log(`\n${description}...`);
	const result = await sandbox.runCommand(options);
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log(
		`  ${result.exitCode === 0 ? "OK" : "FAIL"} (${elapsed}s)`,
	);

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
		resources: { vcpus: 2 },
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

	await runStep(sandbox, "Installing Python 3, pip, and system tools", {
		cmd: "bash",
		args: [
			"-c",
			"dnf install -y python3 python3-pip python3-devel jq sqlite libxml2-devel libxslt-devel at-spi2-atk libdrm libxkbcommon mesa-libgbm nss alsa-lib",
		],
		sudo: true,
	});

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
				'"scrapling[all]"',
			].join(" "),
		],
		sudo: true,
	});

	// scrapling install --force uses apt-get internally which doesn't work on AL2023
	// System deps are already installed above; just install the browsers directly
	await runStep(sandbox, "Installing browser binaries (Playwright)", {
		cmd: "bash",
		args: ["-c", "python3 -m playwright install chromium firefox"],
		sudo: true,
	});

	console.log("\nVerifying installations...");
	const verifications = [
		{
			name: "Node SDK",
			options: {
				cmd: "node",
				args: [
					"-e",
					"require('@anthropic-ai/claude-agent-sdk'); console.log('SDK loaded successfully')",
				],
			},
		},
		{
			name: "Python",
			options: {
				cmd: "python3",
				args: [
					"-c",
					"import pandas, numpy, scipy, duckdb; print('Python packages loaded successfully')",
				],
			},
		},
		{
			name: "Scrapling",
			options: {
				cmd: "python3",
				args: [
					"-c",
					"from scrapling.fetchers import StealthyFetcher; print('StealthyFetcher OK')",
				],
			},
		},
	];

	const results = await Promise.all(
		verifications.map((v) => sandbox.runCommand(v.options)),
	);
	let anyFailed = false;
	for (let i = 0; i < verifications.length; i++) {
		const ok = results[i].exitCode === 0;
		console.log(`${verifications[i].name} verify: ${ok ? "OK" : "FAIL"}`);
		if (!ok) {
			console.log(`  stderr: ${await results[i].stderr()}`);
			anyFailed = true;
		}
	}
	if (anyFailed) {
		throw new Error(
			"One or more verifications failed — aborting snapshot creation",
		);
	}

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
