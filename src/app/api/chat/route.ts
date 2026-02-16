import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { activeSessions } from "@/lib/agent/active-sessions";
import type { Query } from "@/lib/agent/client";
import {
	createLocalAgentQuery,
	extractThinkingFromMessage,
	streamAgentResponse,
} from "@/lib/agent/client";
import {
	extractIsError,
	extractToolResultContent,
} from "@/lib/agent/message-extraction";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { rebuildConversationHistory } from "@/lib/events";
import { ChatEventBuffer } from "@/lib/persistence/event-buffer";
import {
	isTransientDbError,
	prisma,
	retryOnTransientError,
} from "@/lib/prisma";
import type { ConversationMessage } from "@/lib/types";
import { sendMessageSchema } from "@/lib/validations/chat";

function toUserFriendlyError(error: unknown): string {
	if (isTransientDbError(error)) {
		return "A temporary database issue occurred. Your response may not have been saved. Please try again.";
	}

	const msg = error instanceof Error ? error.message : String(error);
	if (msg.includes("Agent process exited with code")) {
		return "The analysis encountered an unexpected error. Please try again.";
	}

	return "Something went wrong. Please try again.";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

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

		const isV2 = existingChat ? existingChat.storageVersion === 2 : true;

		let conversationHistory: ConversationMessage[];

		if (existingChat && isV2) {
			const events = await prisma.chatEvent.findMany({
				where: { chatId: existingChat.id },
				orderBy: { sequenceNum: "asc" },
			});
			conversationHistory = rebuildConversationHistory(events);
		} else if (existingChat) {
			const existingMessages = await prisma.message.findMany({
				where: { chatId: existingChat.id },
				orderBy: { createdAt: "asc" },
			});
			conversationHistory = existingMessages.map((m) => ({
				role: m.role as "user" | "assistant",
				content: m.content,
				thinking: m.thinking,
			}));
		} else {
			conversationHistory = [];
		}

		const sessionId = existingChat?.sessionId || randomUUID();
		const workspacePath = await getOrCreateWorkspace(sessionId);

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
			`[Chat API] ${existingChat ? "Resuming" : "Created"} chat=${chat.id} session=${sessionId} v=${isV2 ? 2 : 1} history=${conversationHistory.length}`,
		);

		await prisma.chat.update({
			where: { id: chat.id },
			data: { isProcessing: true },
		});

		const eventBuffer = isV2
			? new ChatEventBuffer(chat.id, existingChat?.lastSequenceNum ?? 0)
			: null;

		if (eventBuffer) {
			eventBuffer.appendEvent("user_message", {
				content: message,
			} satisfies Prisma.InputJsonValue);
			await eventBuffer.flush();
		} else {
			await prisma.message.create({
				data: {
					chatId: chat.id,
					role: "user",
					content: message,
				},
			});
		}

		const encoder = new TextEncoder();
		const abortController = new AbortController();
		activeSessions.set(chat.id, abortController);
		let agentQuery: Query | null = null;
		let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
		let clientDisconnected = false;

		const stream = new ReadableStream({
			async start(controller) {
				let eventId = 0;
				const sendEvent = (event: string, data: unknown) => {
					if (clientDisconnected) return;
					try {
						controller.enqueue(
							encoder.encode(
								`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
							),
						);
					} catch {
						clientDisconnected = true;
					}
				};

				const KEEPALIVE_INTERVAL_MS = 10_000;
				heartbeatInterval = setInterval(() => {
					if (clientDisconnected) {
						clearInterval(heartbeatInterval!);
						return;
					}
					try {
						controller.enqueue(encoder.encode(":keepalive\n\n"));
					} catch {
						clientDisconnected = true;
						clearInterval(heartbeatInterval!);
					}
				}, KEEPALIVE_INTERVAL_MS);

				const agentOptions = {
					prompt: message,
					workspacePath,
					chatId: chat.id,
					conversationHistory,
					abortController,
					timezone,
					userFirstName: user.firstName ?? undefined,
					userPreferences: user.preferences ?? undefined,
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

				function recordThinking(thinking: string): void {
					sendEvent("thinking", { thinking });
					fullThinkingContent += fullThinkingContent
						? `\n\n${thinking}`
						: thinking;
					if (eventBuffer) {
						eventBuffer.appendEvent("thinking", {
							thinking,
						} satisfies Prisma.InputJsonValue);
					}
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

				if (eventBuffer) {
					eventBuffer.startSafetyTimer();
				}

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
							if (eventBuffer) {
								eventBuffer.appendText("\n\n");
								eventBuffer.appendEvent(
									"turn_complete",
									{} satisfies Prisma.InputJsonValue,
								);
								await eventBuffer.flush();
							} else {
								saveInBackground();
							}
						}

						switch (msg.type) {
							case "assistant": {
								const messageId = msg.message.id;
								if (
									!fullThinkingContent &&
									!sentThinkingIds.has(messageId) &&
									!inThinkingBlock &&
									!pendingThinking
								) {
									const thinking = extractThinkingFromMessage(msg);
									if (thinking) {
										sentThinkingIds.add(messageId);
										recordThinking(thinking);
									}
								}

								for (const block of msg.message.content) {
									if (block.type === "text") {
										fullAssistantContent += block.text;
									} else if (block.type === "tool_use") {
										lastEventWasToolUse = true;
										const { id: toolUseId, name, input } = block;
										toolUses.push({ name, input });
										sendEvent("tool_use", { name, input });
										if (eventBuffer) {
											eventBuffer.appendEvent("tool_use", {
												toolUseId,
												name,
												input,
											} as Prisma.InputJsonValue);
										}
									}
								}
								if (!eventBuffer && !assistantMessageId) {
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
										recordThinking(pendingThinking);
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
										if (eventBuffer) {
											eventBuffer.appendText(delta.text);
										}
									} else if (
										delta.type === "thinking_delta" &&
										delta.thinking
									) {
										pendingThinking += delta.thinking;
										sendEvent("thinking_delta", {
											thinking: delta.thinking,
										});
									}
								} else if (
									event.type === "content_block_stop" &&
									inThinkingBlock &&
									pendingThinking
								) {
									recordThinking(pendingThinking);
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

								if (eventBuffer) {
									eventBuffer.appendEvent("result", {
										stopReason: resultStopReason,
										subtype: msg.subtype,
									} satisfies Prisma.InputJsonValue);
								}
								break;
							}
							case "user": {
								if (!eventBuffer) break;
								if (!msg.parent_tool_use_id) break;

								const text = extractToolResultContent(msg);
								if (!text) break;

								eventBuffer.appendEvent("tool_result", {
									toolUseId: msg.parent_tool_use_id,
									content: text,
									isError: extractIsError(msg.message.content),
								} as Prisma.InputJsonValue);
								break;
							}
						}
					}

					console.log(
						`[Chat API] Stream complete content=${fullAssistantContent.length} tools=${toolUses.length}`,
					);

					if (eventBuffer) {
						await eventBuffer.flush();
					} else {
						await retryOnTransientError(() => saveAssistantMessage(true));
					}

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
					if (heartbeatInterval) clearInterval(heartbeatInterval);
					try {
						if (eventBuffer) {
							await eventBuffer.cleanup();
						} else {
							await saveAssistantMessage(true);
						}
					} catch (e) {
						console.error("[Chat API] Failed to save partial response:", e);
					}
					activeSessions.delete(chat.id);
					if (!activeSessions.has(chat.id)) {
						try {
							await prisma.chat.update({
								where: { id: chat.id },
								data: { isProcessing: false },
							});
						} catch (e) {
							console.error("[Chat API] Failed to clear isProcessing:", e);
						}
					}
					try {
						controller.close();
					} catch {
						/* stream closed */
					}
				}
			},
			cancel() {
				clientDisconnected = true;
				if (heartbeatInterval) clearInterval(heartbeatInterval);
				console.log(
					`[Chat API] Client disconnected, agent continues chat=${chat.id}`,
				);
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
