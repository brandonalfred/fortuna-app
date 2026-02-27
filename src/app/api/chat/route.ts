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
import {
	sendMessageToSSE,
	setupDirectStream,
} from "@/lib/agent/sandbox-runner";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import {
	badRequest,
	conflict,
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
import {
	fetchTextContent,
	isTextMimeType,
	regenerateAttachmentUrls,
} from "@/lib/r2";
import type { Attachment, ConversationMessage } from "@/lib/types";
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

interface SSEWriter {
	send(event: string, data: unknown): void;
	sendRaw(text: string): void;
	disconnect(): void;
	isDisconnected(): boolean;
}

interface SystemAgentMessage {
	type: "system";
	subtype?: string;
	task_id?: string;
	description?: string;
	task_type?: string;
	status?: string;
	summary?: string;
	usage?: {
		total_tokens: number;
		tool_uses: number;
		duration_ms: number;
	};
}

function createSSEWriter(
	controller: ReadableStreamDefaultController,
): SSEWriter {
	const encoder = new TextEncoder();
	let eventId = 0;
	let disconnected = false;

	return {
		send(event, data) {
			if (disconnected) return;
			try {
				controller.enqueue(
					encoder.encode(
						`id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
					),
				);
			} catch {
				disconnected = true;
			}
		},
		sendRaw(text) {
			if (disconnected) return;
			try {
				controller.enqueue(encoder.encode(text));
			} catch {
				disconnected = true;
			}
		},
		disconnect() {
			disconnected = true;
		},
		isDisconnected() {
			return disconnected;
		},
	};
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

		const {
			message,
			chatId,
			timezone,
			attachments: rawAttachments,
		} = parsed.data;

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

		let chatTitle = "New chat";
		if (message) {
			chatTitle = message.length > 50 ? `${message.slice(0, 50)}...` : message;
		}

		const chat =
			existingChat ||
			(await prisma.chat.create({
				data: {
					sessionId,
					title: chatTitle,
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

		let attachments: Attachment[] | undefined;
		if (rawAttachments?.length) {
			for (const att of rawAttachments) {
				if (!att.key.startsWith(`uploads/${user.id}/`)) {
					return badRequest("Invalid attachment key");
				}
			}
			if (!isV2) {
				console.warn(
					"[Chat API] Attachments present but chat uses V1 storage — attachments will not be persisted",
				);
			}
			attachments = await regenerateAttachmentUrls(rawAttachments);
		}

		const attachmentMeta = attachments?.map(({ url: _, ...rest }) => rest);
		const userEventData = {
			content: message,
			...(attachmentMeta && { attachments: attachmentMeta }),
		} satisfies Prisma.InputJsonValue;

		if (eventBuffer) {
			eventBuffer.appendEvent("user_message", userEventData);
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

		let agentPrompt = message;
		if (attachments) {
			for (const att of attachments) {
				if (isTextMimeType(att.mimeType)) {
					try {
						const textContent = await fetchTextContent(att.key);
						agentPrompt += `\n\n--- ${att.filename} ---\n${textContent}\n--- end ---`;
					} catch (e) {
						console.warn(
							`[Chat API] Failed to fetch text content for ${att.filename}:`,
							e,
						);
						agentPrompt += `\n\n--- ${att.filename} ---\n[Error: File content unavailable]\n--- end ---`;
					}
				}
			}
		}

		if (process.env.VERCEL) {
			if (existingChat?.isProcessing) {
				return conflict("A response is already in progress.");
			}

			if (existingChat?.streamToken && existingChat?.sandboxId) {
				try {
					const result = await sendMessageToSSE({
						sandboxId: existingChat.sandboxId,
						streamToken: existingChat.streamToken,
						prompt: agentPrompt,
						attachments,
					});
					return Response.json(
						{
							chatId: chat.id,
							sessionId,
							streamUrl: result.streamUrl,
							streamToken: existingChat.streamToken,
							mode: "direct",
						},
						{ headers: { "X-Chat-Id": chat.id } },
					);
				} catch (error) {
					console.log(
						"[Chat API] SSE server not available, full setup needed",
						{
							chatId: chat.id,
							sandboxId: existingChat.sandboxId,
							error: error instanceof Error ? error.message : String(error),
						},
					);
					await prisma.chat.update({
						where: { id: chat.id },
						data: { sandboxId: null, streamToken: null, agentSessionId: null },
					});
				}
			}

			const newStreamToken = randomUUID();
			const newPersistToken = randomUUID();

			await prisma.chat.update({
				where: { id: chat.id },
				data: {
					streamToken: newStreamToken,
					persistToken: newPersistToken,
				},
			});

			const persistUrl =
				process.env.BETTER_AUTH_URL || `https://${process.env.VERCEL_URL}`;

			const setupAbortController = new AbortController();

			const setupStream = new ReadableStream({
				async start(controller) {
					const sse = createSSEWriter(controller);

					try {
						sse.send("chat_created", { chatId: chat.id, sessionId });

						const SETUP_TIMEOUT_MS = 120_000;
						const timeoutHandle = setTimeout(() => {
							setupAbortController.abort();
						}, SETUP_TIMEOUT_MS);

						const result = await setupDirectStream({
							prompt: agentPrompt,
							workspacePath,
							chatId: chat.id,
							conversationHistory,
							timezone,
							userFirstName: user.firstName ?? undefined,
							userPreferences: user.preferences ?? undefined,
							agentSessionId: existingChat?.agentSessionId ?? undefined,
							attachments,
							persistUrl,
							streamToken: newStreamToken,
							persistToken: newPersistToken,
							initialSequenceNum: existingChat?.lastSequenceNum ?? 0,
							protectionBypassSecret:
								process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
							setupAbortController,
							onStatus: (stage: string, statusMessage: string) => {
								sse.send("status", { stage, message: statusMessage });
							},
						});

						clearTimeout(timeoutHandle);

						sse.send("ready", {
							chatId: chat.id,
							sessionId,
							streamUrl: result.streamUrl,
							streamToken: newStreamToken,
							mode: "direct",
						});
					} catch (error) {
						console.error("[Chat API] Direct stream setup failed:", error);
						await prisma.chat.update({
							where: { id: chat.id },
							data: {
								streamToken: null,
								persistToken: null,
								sandboxId: null,
								isProcessing: false,
							},
						});
						sse.send("error", {
							message:
								"Failed to initialize analysis engine. Please try again.",
						});
					} finally {
						try {
							controller.close();
						} catch {
							// stream already closed
						}
					}
				},
				cancel() {
					setupAbortController.abort();
					console.log(
						`[Chat API] Client disconnected during setup, chat=${chat.id}`,
					);
				},
			});

			return new Response(setupStream, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
					"X-Stream-Mode": "setup",
				},
			});
		}

		const abortController = new AbortController();
		activeSessions.set(chat.id, abortController);
		let agentQuery: Query | null = null;
		let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

		const stream = new ReadableStream({
			async start(controller) {
				const sse = createSSEWriter(controller);

				const KEEPALIVE_INTERVAL_MS = 10_000;
				heartbeatInterval = setInterval(() => {
					if (sse.isDisconnected()) {
						clearInterval(heartbeatInterval!);
						return;
					}
					sse.sendRaw(":keepalive\n\n");
					if (sse.isDisconnected()) {
						clearInterval(heartbeatInterval!);
					}
				}, KEEPALIVE_INTERVAL_MS);

				const agentOptions = {
					prompt: agentPrompt,
					workspacePath,
					chatId: chat.id,
					conversationHistory,
					abortController,
					timezone,
					userFirstName: user.firstName ?? undefined,
					userPreferences: user.preferences ?? undefined,
					agentSessionId: existingChat?.agentSessionId ?? undefined,
					attachments,
					onStatus: (stage: string, statusMessage: string) => {
						sse.send("status", { stage, message: statusMessage });
					},
				};

				const isLocal = !process.env.VERCEL;
				agentQuery = isLocal ? createLocalAgentQuery(agentOptions) : null;
				const agentStream = agentQuery ?? streamAgentResponse(agentOptions);

				sse.send("init", { chatId: chat.id, sessionId });

				let fullAssistantContent = "";
				let fullThinkingContent = "";
				let pendingThinking = "";
				let inThinkingBlock = false;

				function recordThinking(thinking: string): void {
					sse.send("thinking", { thinking });
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
							sse.send("turn_complete", {});
							sse.send("delta", { text: "\n\n" });
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
										if (eventBuffer) {
											eventBuffer.appendEvent("tool_use", {
												toolUseId,
												name,
												input,
											} as Prisma.InputJsonValue);
										}
										if (name !== "Task") {
											sse.send("tool_use", { name, input });
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
										sse.send("delta", { text: delta.text });
										if (eventBuffer) {
											eventBuffer.appendText(delta.text);
										}
									} else if (
										delta.type === "thinking_delta" &&
										delta.thinking
									) {
										pendingThinking += delta.thinking;
										sse.send("thinking_delta", {
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
								sse.send("result", {
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
							case "system": {
								const sysMsg = msg as SystemAgentMessage;
								let eventName: string | null = null;
								let payload: Record<string, unknown> | null = null;

								if (sysMsg.subtype === "task_started") {
									eventName = "subagent_start";
									payload = {
										taskId: sysMsg.task_id,
										description: sysMsg.description,
										taskType: sysMsg.task_type,
									};
								} else if (sysMsg.subtype === "task_notification") {
									eventName = "subagent_complete";
									payload = {
										taskId: sysMsg.task_id,
										status: sysMsg.status,
										summary: sysMsg.summary,
										usage: sysMsg.usage,
									};
								}

								if (eventName && payload) {
									sse.send(eventName, payload);
									if (eventBuffer) {
										eventBuffer.appendEvent(
											eventName,
											payload as Prisma.InputJsonValue,
										);
									}
								}
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
					sse.send("done", { chatId: chat.id, sessionId });
				} catch (error) {
					if (!abortController.signal.aborted) {
						console.error("[Chat API] Stream error:", error);
						sse.send("error", { message: toUserFriendlyError(error) });
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
