/**
 * Sandbox SSE Server
 *
 * Long-lived Node.js script that runs inside the Vercel Sandbox.
 * Uses an infinite async generator pattern to keep a single query() alive
 * across multiple user messages. Exposes an HTTP server for SSE streaming
 * and message ingestion.
 *
 * Reads config from /vercel/sandbox/sse-config.json (written by setup function).
 * CLAUDE_CODE_OAUTH_TOKEN is passed via process env, NOT in the config file.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { SDKEventTranslator } from "./sdk-event-translator.mjs";

const config = JSON.parse(
	readFileSync("/vercel/sandbox/sse-config.json", "utf-8"),
);

const {
	streamToken,
	persistToken,
	persistUrl,
	chatId,
	port,
	initialPrompt,
	initialContentBlocks,
	systemPrompt,
	model,
	allowedTools,
	agentSessionId,
	maxThinkingTokens,
	initialSequenceNum,
	protectionBypassSecret,
} = config;

function resolveContent(contentBlocks, textPrompt) {
	return contentBlocks?.length > 0 ? contentBlocks : textPrompt;
}

// --- Message Queue (infinite generator pattern) ---

const messageQueue = [];
let messageResolve = null;

function enqueueMessage(msg) {
	messageQueue.push(msg);
	if (messageResolve) {
		const resolve = messageResolve;
		messageResolve = null;
		resolve();
	}
}

async function* generateMessages() {
	if (initialPrompt || initialContentBlocks) {
		yield {
			type: "user",
			session_id: "",
			message: {
				role: "user",
				content: resolveContent(initialContentBlocks, initialPrompt),
			},
			parent_tool_use_id: null,
		};
	}

	while (true) {
		while (messageQueue.length > 0) {
			yield messageQueue.shift();
		}
		await new Promise((resolve) => {
			messageResolve = resolve;
		});
	}
}

// --- SSE Broadcasting ---

let sseResponse = null;
let eventId = initialSequenceNum || 0;

function broadcastSSE(event) {
	if (!sseResponse) return;
	try {
		const line = `id: ${++eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
		sseResponse.write(line);
	} catch {
		sseResponse = null;
	}
}

function sendSSEComment(text) {
	if (!sseResponse) return;
	try {
		sseResponse.write(`:${text}\n\n`);
	} catch {
		sseResponse = null;
	}
}

// --- Persistence Poster ---

let persistBatch = [];
let persistTimer = null;
const PERSIST_INTERVAL_MS = 5000;
const PERSIST_BATCH_SIZE = 20;
const MAX_RETRIES = 3;

async function postPersist(payload) {
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const headers = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${persistToken}`,
			};
			if (protectionBypassSecret) {
				headers["x-vercel-protection-bypass"] = protectionBypassSecret;
			}
			const res = await fetch(`${persistUrl}/api/chat/persist`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			});
			if (res.ok) return;
			console.error(
				`[SSE Server] Persist failed (${res.status}), attempt ${attempt + 1}`,
			);
		} catch (err) {
			console.error(
				`[SSE Server] Persist error, attempt ${attempt + 1}:`,
				err.message,
			);
		}
		await new Promise((r) =>
			setTimeout(r, 500 * Math.pow(2, attempt)),
		);
	}
	console.error("[SSE Server] Persist failed after all retries");
}

function batchForPersistence(event) {
	if (event.type === "thinking_delta" || event.type === "init" || event.type === "done") {
		return;
	}

	const normalized = event.type === "delta"
		? { type: "text", data: { content: event.data.text }, seq: eventId }
		: { type: event.type, data: event.data, seq: eventId };
	persistBatch.push(normalized);

	const isCritical =
		event.type === "result" ||
		event.type === "error";

	if (isCritical || persistBatch.length >= PERSIST_BATCH_SIZE) {
		flushPersistence();
	} else if (!persistTimer) {
		persistTimer = setTimeout(flushPersistence, PERSIST_INTERVAL_MS);
	}
}

let lastPersistPromise = Promise.resolve();

function flushPersistence(options = {}) {
	if (persistTimer) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	if (persistBatch.length === 0 && !options.turnComplete && !options.isComplete) {
		return lastPersistPromise;
	}

	const batch = persistBatch;
	persistBatch = [];

	lastPersistPromise = lastPersistPromise
		.catch(() => {})
		.then(() =>
			postPersist({
				chatId,
				events: batch,
				agentSessionId: translator.sessionId,
				turnComplete: options.turnComplete ?? false,
				isComplete: options.isComplete ?? false,
			}),
		);
	return lastPersistPromise;
}

// --- Agent Processing ---

const translator = new SDKEventTranslator();
let activeQuery = null;
let isProcessingTurn = false;

function sendEvent(event) {
	broadcastSSE(event);
	batchForPersistence(event);
}

function sendEvents(events) {
	for (const event of events) {
		sendEvent(event);
	}
}

async function runAgent() {
	const queryOptions = {
		cwd: "/vercel/sandbox",
		model,
		settingSources: ["project"],
		allowedTools,
		permissionMode: "acceptEdits",
		systemPrompt: {
			type: "preset",
			preset: "claude_code",
			append: systemPrompt,
		},
		env: process.env,
		abortController: new AbortController(),
		includePartialMessages: true,
		maxThinkingTokens: maxThinkingTokens || 10000,
		...(agentSessionId && { resume: agentSessionId }),
	};

	activeQuery = query({
		prompt: generateMessages(),
		options: queryOptions,
	});

	try {
		for await (const msg of activeQuery) {
			sendEvents(translator.translate(msg));

			if (msg.type === "result") {
				sendEvents(translator.finalize());
				sendEvent({
					type: "done",
					data: { chatId, sessionId: translator.sessionId },
				});
				await flushPersistence({ turnComplete: true });
				isProcessingTurn = false;
				translator.reset();
			}
		}
	} catch (err) {
		console.error("[SSE Server] Agent error:", err);
		sendEvent({
			type: "error",
			data: { message: "The analysis encountered an unexpected error." },
		});
		await flushPersistence({ isComplete: true });
	}
}

// --- HTTP Server ---

const KEEPALIVE_INTERVAL_MS = 10000;
let keepaliveInterval = null;

function handleCORS(res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch (e) {
				reject(e);
			}
		});
		req.on("error", reject);
	});
}

function isAuthorized(req) {
	const authHeader = req.headers.authorization;
	return authHeader === `Bearer ${streamToken}`;
}

const server = createServer(async (req, res) => {
	handleCORS(res);

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://localhost:${port}`);

	if (req.method === "GET" && url.pathname === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	if (req.method === "GET" && url.pathname === "/stream") {
		if (!isAuthorized(req)) {
			res.writeHead(403);
			res.end("Forbidden");
			return;
		}

		if (sseResponse) {
			try {
				sseResponse.end();
			} catch {
				// old connection already closed
			}
		}

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
			"Access-Control-Allow-Origin": "*",
		});

		sseResponse = res;
		broadcastSSE({ type: "init", data: { chatId, sessionId: agentSessionId || "" } });

		if (keepaliveInterval) clearInterval(keepaliveInterval);
		keepaliveInterval = setInterval(() => {
			sendSSEComment("keepalive");
		}, KEEPALIVE_INTERVAL_MS);

		req.on("close", () => {
			if (sseResponse === res) {
				sseResponse = null;
			}
		});
		return;
	}

	if (req.method === "POST" && url.pathname === "/message") {
		if (!isAuthorized(req)) {
			res.writeHead(403);
			res.end("Forbidden");
			return;
		}

		try {
			const body = await readBody(req);
			const content = resolveContent(body.contentBlocks, body.prompt);

			isProcessingTurn = true;
			translator.reset();
			enqueueMessage({
				type: "user",
				session_id: "",
				message: { role: "user", content },
				parent_tool_use_id: null,
			});

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
		} catch {
			res.writeHead(400);
			res.end("Bad request");
		}
		return;
	}

	if (req.method === "POST" && url.pathname === "/stop") {
		if (!isAuthorized(req)) {
			res.writeHead(403);
			res.end("Forbidden");
			return;
		}

		if (activeQuery && typeof activeQuery.interrupt === "function") {
			activeQuery.interrupt();
			flushPersistence({ turnComplete: true, isComplete: true });
			isProcessingTurn = false;
			translator.reset();
			console.log("[SSE Server] Query interrupted");
		}
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true }));
		return;
	}

	res.writeHead(404);
	res.end("Not found");
});

// --- Startup with retry ---

const MAX_LISTEN_RETRIES = 5;

async function startServer() {
	for (let attempt = 1; attempt <= MAX_LISTEN_RETRIES; attempt++) {
		try {
			await new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, () => {
					server.removeListener("error", reject);
					resolve();
				});
			});
			console.log(`[SSE Server] Listening on port ${port}`);
			return;
		} catch (err) {
			if (err.code === "EADDRINUSE" && attempt < MAX_LISTEN_RETRIES) {
				console.warn(
					`[SSE Server] Port ${port} in use, retry ${attempt}/${MAX_LISTEN_RETRIES}`,
				);
				await new Promise((r) => setTimeout(r, 200 * attempt));
			} else {
				throw err;
			}
		}
	}
}

startServer()
	.then(() => runAgent())
	.catch((err) => {
		console.error("[SSE Server] Fatal error:", err);
		process.exit(1);
	});
