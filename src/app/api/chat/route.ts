import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Query } from "@/lib/agent/client";
import {
	createLocalAgentQuery,
	extractThinkingFromMessage,
	streamAgentResponse,
} from "@/lib/agent/client";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validations/chat";

const TRANSIENT_DB_PATTERNS = [
	"NeonDbError",
	"requested endpoint could not be found",
	"password authentication failed",
	"Connection terminated",
	"ECONNRESET",
];

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isTransientDbError(error: unknown): boolean {
	const msg = errorMessage(error);
	return TRANSIENT_DB_PATTERNS.some((pattern) => msg.includes(pattern));
}

function toUserFriendlyError(error: unknown): string {
	if (isTransientDbError(error)) {
		return "A temporary database issue occurred. Your response may not have been saved. Please try again.";
	}

	if (errorMessage(error).includes("Agent process exited with code")) {
		return "The analysis encountered an unexpected error. Please try again.";
	}

	return "Something went wrong. Please try again.";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) {
			return unauthorized();
		}

		const body = await req.json();
		const parsed = sendMessageSchema.safeParse(body);

		if (!parsed.success) {
			return badRequest("Invalid request", parsed.error.flatten());
		}

		const { message, chatId, timezone } = parsed.data;

		const existingChat = chatId
			? await prisma.chat.findUnique({
					where: { id: chatId, userId: user.id },
				})
			: null;

		const existingMessages = existingChat
			? await prisma.message.findMany({
					where: { chatId: existingChat.id },
					orderBy: { createdAt: "asc" },
				})
			: [];

		const sessionId = existingChat?.sessionId || randomUUID();
		const workspacePath = await getOrCreateWorkspace(sessionId);

		const conversationHistory = existingMessages.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
			thinking: m.thinking,
		}));

		const chat =
			existingChat ||
			(await prisma.chat.create({
				data: {
					sessionId,
					title: message.length > 50 ? `${message.slice(0, 50)}...` : message,
					userId: user.id,
				},
			}));

		console.log(
			`[Chat API] ${existingChat ? "Resuming" : "Created"} chat=${chat.id} session=${sessionId} history=${conversationHistory.length}`,
		);

		await prisma.message.create({
			data: {
				chatId: chat.id,
				role: "user",
				content: message,
			},
		});

		const encoder = new TextEncoder();
		const abortController = new AbortController();

		const agentOptions = {
			prompt: message,
			workspacePath,
			chatId: chat.id,
			conversationHistory,
			abortController,
			timezone,
			agentSessionId: existingChat?.agentSessionId ?? undefined,
		};

		const isLocal = !process.env.VERCEL;
		// Local mode provides a Query object with interrupt() for graceful shutdown.
		// Vercel sandbox mode only provides an async generator (no interrupt support yet).
		const agentQuery: Query | null = isLocal
			? createLocalAgentQuery(agentOptions)
			: null;
		const agentStream = agentQuery ?? streamAgentResponse(agentOptions);

		const stream = new ReadableStream({
			async start(controller) {
				const sendEvent = (event: string, data: unknown) => {
					controller.enqueue(
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					);
				};

				sendEvent("init", { chatId: chat.id, sessionId });

				let fullAssistantContent = "";
				let fullThinkingContent = "";
				const toolUses: Array<{ name: string; input: unknown }> = [];
				let lastEventWasToolUse = false;
				const sentThinkingIds = new Set<string>();

				let capturedSessionId: string | undefined;
				let savedToDb = false;
				async function saveAssistantMessage(): Promise<void> {
					if (savedToDb) return;
					if (!fullAssistantContent && toolUses.length === 0) return;
					await prisma.message.create({
						data: {
							chatId: chat.id,
							role: "assistant",
							content: fullAssistantContent,
							thinking: fullThinkingContent || null,
							toolName: toolUses[0]?.name,
							toolInput:
								toolUses.length > 0
									? (toolUses as unknown as Prisma.InputJsonValue)
									: undefined,
						},
					});
					savedToDb = true;
				}

				try {
					for await (const msg of agentStream) {
						if (
							lastEventWasToolUse &&
							(msg.type === "assistant" ||
								(msg.type === "stream_event" &&
									msg.event.type === "message_start"))
						) {
							sendEvent("turn_complete", {});
							sendEvent("delta", { text: "\n\n" });
							fullAssistantContent += "\n\n";
							lastEventWasToolUse = false;
						}

						switch (msg.type) {
							case "assistant": {
								const messageId = msg.message.id;
								if (!sentThinkingIds.has(messageId)) {
									const thinking = extractThinkingFromMessage(msg);
									if (thinking) {
										sendEvent("thinking", { thinking });
										sentThinkingIds.add(messageId);
										fullThinkingContent +=
											(fullThinkingContent ? "\n\n" : "") + thinking;
									}
								}

								for (const block of msg.message.content) {
									if (block.type === "text") {
										fullAssistantContent += block.text;
									} else if (block.type === "tool_use") {
										lastEventWasToolUse = true;
										const { name, input } = block;
										toolUses.push({ name, input });
										sendEvent("tool_use", { name, input });
									}
								}
								break;
							}
							case "stream_event": {
								const event = msg.event;
								if (
									event.type === "content_block_delta" &&
									"delta" in event &&
									event.delta.type === "text_delta"
								) {
									const delta = event.delta as { text: string };
									sendEvent("delta", { text: delta.text });
								}
								break;
							}
							case "result": {
								if (msg.session_id) {
									capturedSessionId = msg.session_id;
								}
								const resultData: Record<string, unknown> = {
									subtype: msg.subtype,
									duration_ms: msg.duration_ms,
									session_id: msg.session_id,
								};
								if ("cost_usd" in msg) {
									resultData.cost_usd = msg.cost_usd;
								}
								sendEvent("result", resultData);
								break;
							}
						}
					}

					console.log(
						`[Chat API] Stream complete content=${fullAssistantContent.length} tools=${toolUses.length}`,
					);

					try {
						await saveAssistantMessage();
					} catch (saveError) {
						if (!isTransientDbError(saveError)) throw saveError;
						console.warn(
							"[Chat API] Transient DB error, retrying save:",
							saveError,
						);
						await new Promise((r) => setTimeout(r, 1000));
						await saveAssistantMessage();
					}

					if (capturedSessionId) {
						try {
							await prisma.chat.update({
								where: { id: chat.id },
								data: { agentSessionId: capturedSessionId },
							});
							console.log(
								`[Chat API] Persisted agentSessionId=${capturedSessionId}`,
							);
						} catch (err) {
							if (isTransientDbError(err)) {
								console.warn(
									"[Chat API] Transient DB error persisting agentSessionId, retrying:",
									err,
								);
								await new Promise((r) => setTimeout(r, 1000));
								await prisma.chat.update({
									where: { id: chat.id },
									data: { agentSessionId: capturedSessionId },
								});
							} else {
								console.error(
									"[Chat API] Failed to persist agentSessionId:",
									err,
								);
							}
						}
					}

					console.log(
						`[Chat API] Saved message chat=${chat.id} length=${fullAssistantContent.length}`,
					);
					sendEvent("done", { chatId: chat.id, sessionId });
				} catch (error) {
					if (!abortController.signal.aborted) {
						console.error("[Chat API] Stream error:", error);
						const userMessage = toUserFriendlyError(error);
						try {
							sendEvent("error", { message: userMessage });
						} catch {
							/* stream closed */
						}
					}
				} finally {
					try {
						await saveAssistantMessage();
					} catch (e) {
						console.error("[Chat API] Failed to save partial response:", e);
					}
					try {
						controller.close();
					} catch {
						/* stream closed */
					}
				}
			},
			cancel() {
				if (agentQuery) {
					agentQuery.interrupt().catch(() => {
						/* best-effort */
					});
				}
				abortController.abort();
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				"X-Accel-Buffering": "no",
			},
		});
	} catch (error) {
		console.error("Chat API error:", error);
		return serverError(error);
	}
}
