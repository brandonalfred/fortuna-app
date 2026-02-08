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

async function retryOnTransientError<T>(
	fn: () => Promise<T>,
	delayMs = 1000,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (!isTransientDbError(error)) throw error;
		console.warn("[Chat API] Transient DB error, retrying:", error);
		await new Promise((r) => setTimeout(r, delayMs));
		return fn();
	}
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
		let agentQuery: Query | null = null;

		const stream = new ReadableStream({
			async start(controller) {
				let eventId = 0;
				const sendEvent = (event: string, data: unknown) => {
					controller.enqueue(
						encoder.encode(
							`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					);
				};

				const agentOptions = {
					prompt: message,
					workspacePath,
					chatId: chat.id,
					conversationHistory,
					abortController,
					timezone,
					agentSessionId: existingChat?.agentSessionId ?? undefined,
					onStatus: (stage: string, statusMessage: string) => {
						sendEvent("status", { stage, message: statusMessage });
					},
				};

				const isLocal = !process.env.VERCEL;
				agentQuery = isLocal ? createLocalAgentQuery(agentOptions) : null;
				const agentStream = agentQuery ?? streamAgentResponse(agentOptions);

				sendEvent("init", { chatId: chat.id, sessionId });

				let fullAssistantContent = "";
				let fullThinkingContent = "";
				let pendingThinking = "";
				let inThinkingBlock = false;

				function appendThinking(text: string): void {
					fullThinkingContent += (fullThinkingContent ? "\n\n" : "") + text;
				}
				const toolUses: Array<{ name: string; input: unknown }> = [];
				let lastEventWasToolUse = false;
				const sentThinkingIds = new Set<string>();

				let resultStopReason: string | null = null;
				let capturedSessionId: string | undefined;
				let assistantMessageId: string | null = null;
				let lastSaveTime = 0;
				let saveInFlight: Promise<void> | null = null;
				const SAVE_DEBOUNCE_MS = 2000;

				function saveInBackground(): void {
					saveAssistantMessage().catch((e) =>
						console.warn("[Chat API] Background save failed:", e),
					);
				}

				async function saveAssistantMessage(isFinal = false): Promise<void> {
					if (saveInFlight) {
						await saveInFlight;
					}

					if (!fullAssistantContent && toolUses.length === 0) return;
					if (
						!isFinal &&
						assistantMessageId &&
						Date.now() - lastSaveTime < SAVE_DEBOUNCE_MS
					)
						return;

					const doSave = async () => {
						const data = {
							chatId: chat.id,
							role: "assistant" as const,
							content: fullAssistantContent,
							thinking: fullThinkingContent || null,
							stopReason: isFinal ? resultStopReason : null,
							toolName: toolUses[0]?.name,
							toolInput:
								toolUses.length > 0
									? (toolUses as unknown as Prisma.InputJsonValue)
									: undefined,
						};

						if (!assistantMessageId) {
							const msg = await prisma.message.create({ data });
							assistantMessageId = msg.id;
						} else {
							await prisma.message.update({
								where: { id: assistantMessageId },
								data,
							});
						}
						lastSaveTime = Date.now();
					};

					saveInFlight = doSave();
					try {
						await saveInFlight;
					} finally {
						saveInFlight = null;
					}
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
							saveInBackground();
						}

						switch (msg.type) {
							case "assistant": {
								const messageId = msg.message.id;
								if (!fullThinkingContent && !sentThinkingIds.has(messageId)) {
									const thinking = extractThinkingFromMessage(msg);
									if (thinking) {
										sendEvent("thinking", { thinking });
										sentThinkingIds.add(messageId);
										appendThinking(thinking);
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
								if (!assistantMessageId) {
									saveInBackground();
								}
								break;
							}
							case "stream_event": {
								const event = msg.event;
								if (
									event.type === "content_block_start" &&
									"content_block" in event
								) {
									if (inThinkingBlock && pendingThinking) {
										sendEvent("thinking", {
											thinking: pendingThinking,
										});
										appendThinking(pendingThinking);
										pendingThinking = "";
									}
									const block = event.content_block as {
										type: string;
									};
									inThinkingBlock = block.type === "thinking";
								} else if (
									event.type === "content_block_delta" &&
									"delta" in event
								) {
									const delta = event.delta as {
										type: string;
										text?: string;
										thinking?: string;
									};
									if (delta.type === "text_delta" && delta.text) {
										sendEvent("delta", { text: delta.text });
									} else if (
										delta.type === "thinking_delta" &&
										delta.thinking
									) {
										pendingThinking += delta.thinking;
									}
								} else if (
									event.type === "content_block_stop" &&
									inThinkingBlock &&
									pendingThinking
								) {
									sendEvent("thinking", {
										thinking: pendingThinking,
									});
									appendThinking(pendingThinking);
									pendingThinking = "";
									inThinkingBlock = false;
								}
								break;
							}
							case "result": {
								resultStopReason =
									"stop_reason" in msg ? (msg.stop_reason as string) : null;
								if (msg.session_id) {
									capturedSessionId = msg.session_id;
								}
								console.log(
									`[Chat API] Result subtype=${msg.subtype} stop_reason=${resultStopReason}`,
								);
								sendEvent("result", {
									subtype: msg.subtype,
									stop_reason: resultStopReason,
									duration_ms: msg.duration_ms,
									session_id: msg.session_id,
									...("cost_usd" in msg && {
										cost_usd: msg.cost_usd,
									}),
								});
								break;
							}
						}
					}

					console.log(
						`[Chat API] Stream complete content=${fullAssistantContent.length} tools=${toolUses.length}`,
					);

					await retryOnTransientError(() => saveAssistantMessage(true));

					if (capturedSessionId) {
						try {
							await retryOnTransientError(() =>
								prisma.chat.update({
									where: { id: chat.id },
									data: { agentSessionId: capturedSessionId },
								}),
							);
							console.log(
								`[Chat API] Persisted agentSessionId=${capturedSessionId}`,
							);
						} catch (err) {
							console.error(
								"[Chat API] Failed to persist agentSessionId:",
								err,
							);
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
						await saveAssistantMessage(true);
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
				"X-Chat-Id": chat.id,
			},
		});
	} catch (error) {
		console.error("Chat API error:", error);
		return serverError(error);
	}
}
